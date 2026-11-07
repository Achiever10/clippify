import { NextResponse } from "next/server";
import { adminDb } from "@/app/api/_lib/firebase-admin";

// Web-only route — see scripts/build-mobile.mjs.
// Powers the landing page's Popular Clips / Top Creators sections (both previously
// hardcoded fake data — real approved clips now exist, so there's no reason to fake
// it). Firestore rules require sign-in to read /clips, and a logged-out visitor is
// exactly who's looking at the landing page, so this reads with Admin credentials and
// hands back only the public-safe subset — no change to the security rules needed.

type LandingBody = {
  popularClips: Array<{
    title: string;
    creatorName: string;
    viewCount: number;
    likeCount: number;
    thumbnailUrl: string | null;
  }>;
  topCreators: Array<{ creatorName: string; clipCount: number; totalViews: number }>;
};

const CACHE_MS = 120_000;
const cacheHeaders = { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" };
let cached: { at: number; body: LandingBody } | null = null;
let inflight: Promise<LandingBody> | null = null;

async function loadLandingBody(): Promise<LandingBody> {
  const db = adminDb();
  // Field mask: the landing page never needs links, payouts, or storage URLs.
  const snap = await db
    .collection("clips")
    .where("status", "==", "approved")
    .select("title", "creatorName", "creatorId", "viewCount", "likeCount", "thumbnailUrl")
    .get();
  const clips = snap.docs.map((d) => d.data());

  // Sorted in memory rather than via a Firestore orderBy — avoids needing a composite
  // index for a where+orderBy-on-a-different-field query (see firestore-rules memory:
  // the same trap clips.ts's client-side queries already route around).
  const popularClips = [...clips]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 8)
    .map((c) => ({
      title: c.title as string,
      creatorName: c.creatorName as string,
      viewCount: (c.viewCount as number) ?? 0,
      likeCount: (c.likeCount as number) ?? 0,
      thumbnailUrl: (c.thumbnailUrl as string) ?? null,
    }));

  const byCreator = new Map<string, { creatorName: string; clipCount: number; totalViews: number }>();
  for (const c of clips) {
    const key = (c.creatorId as string) ?? (c.creatorName as string);
    const entry = byCreator.get(key) ?? { creatorName: c.creatorName as string, clipCount: 0, totalViews: 0 };
    entry.clipCount += 1;
    entry.totalViews += (c.viewCount as number) ?? 0;
    byCreator.set(key, entry);
  }
  const topCreators = Array.from(byCreator.values())
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 5);

  return { popularClips, topCreators };
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body, { headers: cacheHeaders });
  }

  if (!inflight) {
    inflight = loadLandingBody()
      .then((body) => {
        cached = { at: Date.now(), body };
        return body;
      })
      .finally(() => {
        inflight = null;
      });
  }

  try {
    const body = await inflight;
    return NextResponse.json(body, { headers: cacheHeaders });
  } catch (error) {
    console.error("Landing stats error:", error);
    return NextResponse.json(
      { popularClips: [], topCreators: [] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
