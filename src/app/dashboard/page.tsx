"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  DollarSign,
  Film,
  Heart,
  Play,
  ShoppingBag,
} from "lucide-react";
import RequireAuth from "@/components/dashboard/RequireAuth";
import { useAuth } from "@/lib/auth/auth-context";
import StatCard from "@/components/dashboard/StatCard";
import XpCard from "@/components/dashboard/XpCard";
import EmptyState from "@/components/dashboard/EmptyState";
import { subscribeToApprovedClips, subscribeToClipsForUser, subscribeToFavorites, type Clip } from "@/lib/clips";
import { extractYouTubeVideoId, youtubeThumbnailUrl } from "@/lib/youtube";
import { subscribeToCampaignsForUser, type Campaign } from "@/lib/firebase-helpers";

const roleLabel: Record<string, string> = {
  brand: "Brand",
  creator: "Creator",
  both: "Brand & Creator",
  admin: "Admin",
};

export default function DashboardHome() {
  return (
    <RequireAuth area="account">
      <DashboardHomeContent />
    </RequireAuth>
  );
}

function DashboardHomeContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clips, setClips] = useState<Clip[]>([]);
  const [myClips, setMyClips] = useState<Clip[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);

  useEffect(() => {
    const unsubClips = subscribeToApprovedClips(setClips);
    return () => unsubClips();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubMyClips = subscribeToClipsForUser(user.id, setMyClips);
    const unsubCampaigns = subscribeToCampaignsForUser(user.id, setCampaigns);
    const unsubFavorites = subscribeToFavorites(user.id, (favorites) => setFavoriteCount(favorites.length));
    return () => {
      unsubMyClips();
      unsubCampaigns();
      unsubFavorites();
    };
  }, [user]);

  const trendingCreators = useMemo(() => {
    const counts = new Map<string, { name: string; clips: number }>();
    for (const clip of clips) {
      const entry = counts.get(clip.creatorId) ?? { name: clip.creatorName, clips: 0 };
      entry.clips += 1;
      counts.set(clip.creatorId, entry);
    }
    const colors = [
      "bg-amber-500 text-black",
      "bg-slate-800 text-white",
      "bg-orange-500 text-white",
      "bg-sky-500 text-white",
    ];
    return [...counts.entries()]
      .sort((a, b) => b[1].clips - a[1].clips)
      .slice(0, 4)
      .map(([id, entry], i) => ({ id, ...entry, color: colors[i % colors.length] }));
  }, [clips]);

  if (!user) return null;

  const canViewBrand = user.role === "brand" || user.role === "both";
  const canViewCreator = user.role === "creator" || user.role === "both";
  const requestedView = searchParams.get("view");
  const activeView: "brand" | "creator" =
    requestedView === "brand"
      ? "brand"
      : requestedView === "creator"
        ? "creator"
        : user.role === "brand"
          ? "brand"
          : user.role === "creator"
            ? "creator"
            : "brand";

  const showBrand = (activeView === "brand" && canViewBrand) || (!canViewCreator && canViewBrand);
  const showCreator = (activeView === "creator" && canViewCreator) || (!canViewBrand && canViewCreator);

  const setRoleView = (nextView: "brand" | "creator") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    router.replace(`/dashboard?${params.toString()}`);
  };

  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const myEarnings = myClips
    .filter((c) => c.status === "approved")
    .reduce((sum, c) => sum + (c.payoutAtSubmission ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {showBrand
              ? "Track campaigns, creative briefs, and brand performance."
              : "Manage clips, earnings, and creator opportunities."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(canViewBrand || canViewCreator) && (
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-[#111]">
              {canViewBrand && (
                <button
                  type="button"
                  onClick={() => setRoleView("brand")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeView === "brand"
                      ? "bg-amber-500 text-black"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  Brand view
                </button>
              )}
              {canViewCreator && (
                <button
                  type="button"
                  onClick={() => setRoleView("creator")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeView === "creator"
                      ? "bg-amber-500 text-black"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  Creator view
                </button>
              )}
            </div>
          )}
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-yellow-400/10 dark:text-yellow-400">
            {roleLabel[user.role]}
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {showBrand && (
          <PromoBanner
            icon={Briefcase}
            title="Post a Campaign"
            text="Post a campaign and get custom clips made by pro streamers."
            cta="Post a Campaign"
            href="/dashboard/post-job"
          />
        )}
        {showCreator && (
          <PromoBanner
            icon={Briefcase}
            title="Join a Campaign"
            text="Submit a clip to an open brand campaign — once approved, it's live on Browse Clips too."
            cta="Browse Campaigns"
            href="/dashboard/competitions"
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {showBrand ? (
          <StatCard icon={ShoppingBag} label="Active Campaigns" value={String(activeCampaigns)} />
        ) : (
          <StatCard icon={Film} label="Clips Uploaded" value={String(myClips.length)} />
        )}
        <StatCard icon={Heart} label="Favorites" value={String(favoriteCount)} />
        {showCreator && (
          <StatCard icon={DollarSign} label="Earnings" value={`₦${myEarnings.toFixed(2)}`} />
        )}
      </div>

      {showCreator && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2">
          <XpCard uid={user.id} />
        </div>
      )}

      <SectionHeader title="Featured Clips" href="/dashboard/browse" />
      {clips.length === 0 ? (
        <EmptyState icon={Film} title="No clips yet" text="Approved clips will show up here." />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {clips.slice(0, 4).map((clip) => (
            <div
              key={clip.id}
              className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm shadow-slate-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-[#111] dark:shadow-none"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
                <ClipPoster clip={clip} />
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {clip.title}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                  {clip.creatorName}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {trendingCreators.length > 0 && (
        <>
          <SectionHeader title="Trending Creators" href="/dashboard/browse" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {trendingCreators.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm shadow-slate-100 dark:border-white/10 dark:bg-[#111] dark:shadow-none"
              >
                <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${c.color}`}>
                  {c.name.charAt(0)}
                </span>
                <p className="mt-2 flex items-center justify-center gap-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {c.name}
                  <BadgeCheck className="h-3.5 w-3.5 text-sky-500" />
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{c.clips} clips</p>
              </div>
            ))}
          </div>
        </>
      )}

      {showBrand && (
        <>
          <SectionHeader title="My Campaigns" href="/dashboard/campaigns" />
          {campaigns.length === 0 ? (
            <EmptyState icon={Briefcase} title="No campaigns yet" text="Post a campaign to get started." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-white/10 dark:bg-[#111]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/10">
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 5).map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0 dark:border-white/5">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.title}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium capitalize text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400">
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        ₦{c.budget.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="h-4" />
    </div>
  );
}

function clipPosterUrl(clip: Clip) {
  if (clip.thumbnailUrl) return clip.thumbnailUrl;
  const youtubeId = clip.link ? extractYouTubeVideoId(clip.link) : null;
  return youtubeId ? youtubeThumbnailUrl(youtubeId) : null;
}

function ClipPoster({ clip }: { clip: Clip }) {
  const poster = clipPosterUrl(clip);
  if (!poster) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
        <Play className="h-3.5 w-3.5 fill-white text-white" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-4 mt-10 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <Link
        href={href}
        className="group flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-yellow-400"
      >
        View all
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
      </Link>
    </div>
  );
}

function PromoBanner({
  icon: Icon,
  title,
  text,
  cta,
  href,
}: {
  icon: typeof Briefcase;
  title: string;
  text: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 p-6 dark:from-[#171308] dark:to-[#0a0a0a] dark:border dark:border-yellow-400/20">
      <div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/10 text-black dark:bg-yellow-400/10 dark:text-yellow-400">
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-base font-bold text-black dark:text-white">{title}</p>
        <p className="mt-1 text-sm text-black/70 dark:text-slate-400">{text}</p>
        <Link
          href={href}
          className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-xs font-semibold text-yellow-400 transition-transform duration-200 hover:scale-105 dark:bg-gradient-to-r dark:from-yellow-400 dark:to-amber-500 dark:text-black"
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}
