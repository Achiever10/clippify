import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type { Campaign } from "@/lib/firebase-helpers";
import { createNotification } from "@/lib/notifications";
import { awardXp, XP_REWARDS } from "@/lib/xp";

export type ClipStatus = "pending" | "approved" | "rejected";

export type Clip = {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  category: string;
  link: string;
  videoUrl: string;
  status: ClipStatus;
  // Set when this clip was submitted as a creator's entry to a brand's campaign
  // (see /dashboard/competitions) rather than uploaded standalone.
  campaignId?: string;
  campaignTitle?: string;
  // Copied from the campaign's payoutPerClip at submission time (not looked up live)
  // so a creator's earnings reflect the rate that was in effect when they submitted —
  // and so Earnings/Payouts never need to read other users' campaign documents, which
  // Firestore rules only allow for a campaign's own brand or an admin.
  payoutAtSubmission?: number;
  // Auto-fetched from the YouTube Data API (src/lib/youtube.ts) or TikAPI
  // (src/lib/tiktok.ts) when `link` is a recognized YouTube/TikTok URL. Absent for
  // other links, uploaded files, or when auto-fetch didn't find a match.
  viewCount?: number;
  likeCount?: number;
  thumbnailUrl?: string;
  createdAt: Timestamp | null;
};

export async function uploadClipVideo(creatorId: string, file: File): Promise<string> {
  const path = `clips/${creatorId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// For a creator-supplied thumbnail image — overrides whatever (if anything) the
// link's auto-fetched stats came back with. See SubmitClipModal.
export async function uploadClipThumbnail(creatorId: string, file: File): Promise<string> {
  const path = `clip-thumbnails/${creatorId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function createClip({
  creatorId,
  creatorName,
  title,
  category,
  link = "",
  videoUrl = "",
  status = "pending",
  campaignId,
  campaignTitle,
  payoutAtSubmission,
  viewCount,
  likeCount,
  thumbnailUrl,
}: {
  creatorId: string;
  creatorName: string;
  title: string;
  category: string;
  link?: string;
  videoUrl?: string;
  // Only "approved" here actually goes through — the Firestore rule independently
  // re-checks the platform's autoModeration setting, so a tampered client passing
  // "approved" without that setting on just gets rejected, not silently downgraded.
  status?: ClipStatus;
  campaignId?: string;
  campaignTitle?: string;
  payoutAtSubmission?: number;
  viewCount?: number;
  likeCount?: number;
  thumbnailUrl?: string;
}) {
  const docRef = await addDoc(collection(db, "clips"), {
    creatorId,
    creatorName,
    title,
    category,
    link,
    videoUrl,
    status,
    ...(campaignId ? { campaignId, campaignTitle: campaignTitle ?? "" } : {}),
    ...(payoutAtSubmission !== undefined ? { payoutAtSubmission } : {}),
    ...(viewCount !== undefined ? { viewCount } : {}),
    ...(likeCount !== undefined ? { likeCount } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Sorted client-side (rather than via a Firestore `orderBy` alongside the `where`
// below) so these listeners don't depend on a composite index being created in the
// Firebase console — a where+orderBy-on-a-different-field query fails outright without
// one, and silently returns nothing here since the error callback swallows it.
function byCreatedAtDesc<T extends { createdAt: Timestamp | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

export function subscribeToApprovedClips(callback: (clips: Clip[]) => void) {
  const q = query(collection(db, "clips"), where("status", "==", "approved"));
  return onSnapshot(
    q,
    (snap) => callback(byCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Clip))),
    (error) => {
      console.error("Approved clips listener error:", error);
      callback([]);
    },
  );
}

export function subscribeToPendingClips(callback: (clips: Clip[]) => void) {
  const q = query(collection(db, "clips"), where("status", "==", "pending"));
  return onSnapshot(
    q,
    (snap) => callback(byCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Clip))),
    (error) => {
      console.error("Pending clips listener error:", error);
      callback([]);
    },
  );
}

export function subscribeToClipsForUser(userId: string, callback: (clips: Clip[]) => void) {
  const q = query(collection(db, "clips"), where("creatorId", "==", userId));
  return onSnapshot(
    q,
    (snap) => callback(byCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Clip))),
    (error) => {
      console.error("Creator clips listener error:", error);
      callback([]);
    },
  );
}

export function subscribeToClipsForCampaign(campaignId: string, callback: (clips: Clip[]) => void) {
  return subscribeToClipsForCampaigns([campaignId], callback);
}

// Firestore `in` queries accept at most 30 values. Chunking keeps a brand with many
// campaigns on a handful of listeners instead of one snapshot per campaign.
const CAMPAIGN_ID_IN_LIMIT = 30;

export function subscribeToClipsForCampaigns(campaignIds: string[], callback: (clips: Clip[]) => void) {
  const ids = [...new Set(campaignIds)].filter(Boolean);
  if (ids.length === 0) {
    callback([]);
    return () => {};
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CAMPAIGN_ID_IN_LIMIT) {
    chunks.push(ids.slice(i, i + CAMPAIGN_ID_IN_LIMIT));
  }

  const perChunk = new Map<number, Clip[]>();
  const emit = () => {
    callback(byCreatedAtDesc(Array.from(perChunk.values()).flat()));
  };

  const unsubs = chunks.map((chunk, index) => {
    const q = query(collection(db, "clips"), where("campaignId", "in", chunk));
    return onSnapshot(
      q,
      (snap) => {
        perChunk.set(
          index,
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Clip),
        );
        emit();
      },
      (error) => {
        console.error("Campaign clips listener error:", error);
        perChunk.set(index, []);
        emit();
      },
    );
  });

  return () => unsubs.forEach((unsub) => unsub());
}

// Approving a clip tied to a campaign has to check and debit that campaign's
// remaining budget atomically — two brands/admins approving clips on the same
// campaign at the same moment must not both succeed past the budget. Rejecting, or
// resolving a clip with no campaignId, never touches budget, so those stay a plain
// update. Notifies the creator either way (fire-and-forget — a failed notification
// write shouldn't block the moderation action itself).
export async function setClipStatus(clip: Clip, status: ClipStatus) {
  if (status !== "approved" || !clip.campaignId) {
    await updateDoc(doc(db, "clips", clip.id), { status });
    notifyClipResolved(clip, status);
    return;
  }

  const campaignRef = doc(db, "campaigns", clip.campaignId);
  const clipRef = doc(db, "clips", clip.id);
  const payout = clip.payoutAtSubmission ?? 0;

  const exhausted = await runTransaction(db, async (tx) => {
    const snap = await tx.get(campaignRef);
    if (!snap.exists()) throw new Error("This campaign no longer exists.");
    const campaign = snap.data() as Campaign;
    const spent = campaign.spent ?? 0;
    const remaining = campaign.budget - spent;
    if (payout > remaining) {
      throw new Error(
        `Not enough budget left on "${campaign.title}" to approve this clip — ₦${remaining.toFixed(2)} remaining, ₦${payout.toFixed(2)} needed.`,
      );
    }
    const newSpent = spent + payout;
    const budgetUsedUp = newSpent >= campaign.budget;
    tx.update(clipRef, { status });
    tx.update(campaignRef, {
      spent: newSpent,
      // Budget fully used: stop the campaign from taking further submissions/approvals
      // rather than relying on someone noticing and flipping the status by hand.
      ...(budgetUsedUp ? { status: "completed" } : {}),
    });
    return budgetUsedUp ? { brandId: campaign.brandId, title: campaign.title } : null;
  });
  notifyClipResolved(clip, status);
  awardXp(clip.creatorId, clip.creatorName, XP_REWARDS.clipApproved).catch((error) =>
    console.error("Failed to award clip-approved XP:", error),
  );
  if (exhausted) {
    createNotification({
      userId: exhausted.brandId,
      type: "budget_exhausted",
      title: "Campaign budget used up",
      body: `"${exhausted.title}" has paid out its full budget and is now marked completed.`,
      link: `/dashboard/campaigns/${clip.campaignId}`,
      campaignId: clip.campaignId,
    }).catch((error) => console.error("Failed to create budget-exhausted notification:", error));
  }
}

function notifyClipResolved(clip: Clip, status: ClipStatus) {
  if (!clip.campaignId || status === "pending") return;
  const approved = status === "approved";
  createNotification({
    userId: clip.creatorId,
    type: approved ? "clip_approved" : "clip_rejected",
    title: approved ? "Clip approved" : "Clip rejected",
    body: approved
      ? `Your clip "${clip.title}" for "${clip.campaignTitle}" was approved${
          clip.payoutAtSubmission ? ` — ₦${clip.payoutAtSubmission.toFixed(2)} added to your earnings.` : "."
        }`
      : `Your clip "${clip.title}" for "${clip.campaignTitle}" wasn't approved this time.`,
    link: approved ? "/dashboard/earnings" : `/dashboard/competitions/${clip.campaignId}`,
    campaignId: clip.campaignId,
    clipId: clip.id,
  }).catch((error) => console.error("Failed to create clip-resolved notification:", error));
}

export type FavoriteClip = {
  clipId: string;
  title: string;
  creatorName: string;
  viewCount?: number;
  likeCount?: number;
  addedAt: Timestamp | null;
};

export async function addFavorite(
  userId: string,
  clip: Pick<Clip, "id" | "title" | "creatorName" | "viewCount" | "likeCount">,
) {
  await setDoc(doc(db, "users", userId, "favorites", clip.id), {
    clipId: clip.id,
    title: clip.title,
    creatorName: clip.creatorName,
    ...(clip.viewCount !== undefined ? { viewCount: clip.viewCount } : {}),
    ...(clip.likeCount !== undefined ? { likeCount: clip.likeCount } : {}),
    addedAt: serverTimestamp(),
  });
}

export async function removeFavorite(userId: string, clipId: string) {
  await deleteDoc(doc(db, "users", userId, "favorites", clipId));
}

export function subscribeToFavorites(userId: string, callback: (favorites: FavoriteClip[]) => void) {
  const q = query(collection(db, "users", userId, "favorites"), orderBy("addedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as FavoriteClip)),
    (error) => {
      console.error("Favorites listener error:", error);
      callback([]);
    },
  );
}

export async function fetchFavoriteIds(userId: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, "users", userId, "favorites"));
  return new Set(snap.docs.map((d) => d.id));
}
