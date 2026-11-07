"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { Eye, ExternalLink, Film, Heart, Play, Search, X } from "lucide-react";
import RequireAuth from "@/components/dashboard/RequireAuth";
import TikTokEmbed from "@/components/TikTokEmbed";
import { useAuth } from "@/lib/auth/auth-context";
import { addFavorite, fetchFavoriteIds, removeFavorite, subscribeToApprovedClips, type Clip } from "@/lib/clips";
import { extractYouTubeVideoId, youtubeThumbnailUrl } from "@/lib/youtube";
import { extractTikTokVideoId, fetchTikTokVideoStats, isTikTokLink } from "@/lib/tiktok";

const categories = ["All", "Tech", "Sports", "Motivation", "Nature", "Gaming", "Podcast"];

export default function BrowseClipsPage() {
  return (
    <RequireAuth area="account">
      <BrowseClipsContent />
    </RequireAuth>
  );
}

function BrowseClipsContent() {
  const { user } = useAuth();
  const [active, setActive] = useState("All");
  const [search, setSearch] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [playingClip, setPlayingClip] = useState<Clip | null>(null);
  // Thumbnails fetched on the fly for clips that have a link but never got a
  // thumbnailUrl captured at submission time (e.g. a TikTok fetch failed back then,
  // or a YouTube API key wasn't configured yet). Not persisted to Firestore — clip
  // update rules only allow changing `status`, and this is cheap enough to just
  // recompute per page load. YouTube doesn't even need this map: its thumbnail URL is
  // a predictable CDN path, derived inline below instead.
  const [fetchedThumbnails, setFetchedThumbnails] = useState<Record<string, string>>({});
  // Clips we've already attempted (successfully or not) during this page load, so a
  // permanently-failing fetch (private/deleted video, TikAPI error) doesn't get retried
  // on every `clips` snapshot update for as long as the page stays open.
  const attemptedThumbnailIds = useRef<Set<string>>(new Set());
  const fetchingThumbnailIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeToApprovedClips((next) => {
      setClips(next);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pending = clips.filter(
      (clip) =>
        !clip.thumbnailUrl &&
        clip.link &&
        isTikTokLink(clip.link) &&
        !attemptedThumbnailIds.current.has(clip.id) &&
        !fetchingThumbnailIds.current.has(clip.id),
    );
    if (pending.length === 0) return;

    // A page of clips used to fire one TikAPI request per card at once. Three at a
    // time keeps the grid filling in without saturating the API or the browser.
    const queue = [...pending];
    const workerCount = Math.min(3, queue.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (!cancelled) {
        const clip = queue.shift();
        if (!clip) return;
        fetchingThumbnailIds.current.add(clip.id);
        try {
          const result = await fetchTikTokVideoStats(clip.link);
          if (!cancelled && result?.thumbnailUrl) {
            setFetchedThumbnails((prev) =>
              prev[clip.id] ? prev : { ...prev, [clip.id]: result.thumbnailUrl },
            );
          }
        } finally {
          attemptedThumbnailIds.current.add(clip.id);
          fetchingThumbnailIds.current.delete(clip.id);
        }
      }
    });
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [clips]);

  useEffect(() => {
    if (!user) return;
    fetchFavoriteIds(user.id).then(setFavoriteIds);
  }, [user]);

  const toggleFavorite = async (clip: Clip) => {
    if (!user) return;
    const isFavorite = favoriteIds.has(clip.id);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(clip.id);
      else next.add(clip.id);
      return next;
    });
    try {
      if (isFavorite) await removeFavorite(user.id, clip.id);
      else await addFavorite(user.id, clip);
    } catch {
      // revert optimistic update on failure
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.add(clip.id);
        else next.delete(clip.id);
        return next;
      });
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clips.filter((clip) => {
      const matchesCategory = active === "All" || clip.category === active;
      const matchesSearch =
        !term || clip.title.toLowerCase().includes(term) || clip.creatorName.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [clips, active, search]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Browse Clips</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        See what clippers have submitted for campaigns across the platform.
      </p>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clips, creators, categories..."
            className="w-full rounded-lg border-2 border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-900 focus:outline-none dark:border-white/10 dark:bg-[#111] dark:text-white dark:focus:border-white"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActive(cat)}
            className={`rounded-full border-2 px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
              active === cat
                ? "border-black bg-yellow-400 text-black dark:border-yellow-200 dark:shadow-[2px_2px_0_0_#fde68a]"
                : "border-slate-200 bg-transparent text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white dark:hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500 dark:border-white/10 dark:border-t-yellow-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-[#111]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-100 text-black dark:bg-yellow-400/10 dark:text-yellow-400">
            <Film className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
            {clips.length === 0 ? "No clips have been approved yet" : "No clips match your filters"}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {clips.length === 0
              ? "Once a creator submits a clip for a campaign and it clears moderation, it'll show up here."
              : "Try a different category or search term."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {filtered.map((clip) => {
          const youtubeId = clip.link ? extractYouTubeVideoId(clip.link) : null;
          const effectiveThumbnail =
            clip.thumbnailUrl || (youtubeId ? youtubeThumbnailUrl(youtubeId) : undefined) || fetchedThumbnails[clip.id];
          return (
            <div
              key={clip.id}
              className="group overflow-hidden rounded-2xl border-2 border-slate-900 bg-white transition-all duration-150 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_#000] dark:border-white/15 dark:hover:shadow-[4px_4px_0_0_rgba(255,255,255,0.4)]"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
                {clip.videoUrl || (effectiveThumbnail && clip.link) ? (
                  <button
                    onClick={() => setPlayingClip(clip)}
                    aria-label={`Play ${clip.title}`}
                    className="group/play relative h-full w-full"
                  >
                    {effectiveThumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={effectiveThumbnail}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Film className="h-7 w-7 text-white/40" />
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/10 transition-colors group-hover/play:from-black/80" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-black/40 backdrop-blur transition-transform group-hover/play:scale-110 group-hover/play:bg-yellow-400 group-hover/play:text-black">
                        <Play className="h-4 w-4 fill-white text-white group-hover/play:fill-black group-hover/play:text-black" />
                      </span>
                    </span>
                  </button>
                ) : clip.link ? (
                  <a
                    href={clip.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-white/60 transition-colors hover:text-white"
                  >
                    <Film className="h-7 w-7" />
                    <span className="flex items-center gap-1 text-[11px] font-medium">
                      Watch clip <ExternalLink className="h-3 w-3" />
                    </span>
                  </a>
                ) : (
                  <Film className="h-8 w-8 text-white/30" />
                )}

                <span className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/20 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  {clip.category}
                </span>

                {clip.viewCount !== undefined && (
                  <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    <Eye className="h-3 w-3" /> {clip.viewCount.toLocaleString()}
                  </span>
                )}

                <button
                  onClick={() => toggleFavorite(clip)}
                  aria-label={favoriteIds.has(clip.id) ? "Remove from favorites" : "Add to favorites"}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur transition-transform hover:scale-110"
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${favoriteIds.has(clip.id) ? "fill-red-500 text-red-500" : "text-white"}`}
                  />
                </button>
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {clip.title}
                </p>
                <div className="mt-0.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">{clip.creatorName}</span>
                  {clip.likeCount !== undefined && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Heart className="h-3 w-3" /> {clip.likeCount.toLocaleString()}
                    </span>
                  )}
                </div>
                {clip.campaignTitle && (
                  <p className="mt-1 truncate text-[11px] text-amber-600 dark:text-yellow-400">
                    For: {clip.campaignTitle}
                  </p>
                )}
              </div>
            </div>
          );
          })}
        </div>
      )}

      {playingClip && <PlayerModal clip={playingClip} onClose={() => setPlayingClip(null)} />}
      {playingClip && !playingClip.videoUrl && playingClip.link && extractTikTokVideoId(playingClip.link) && (
        <Script src="https://www.tiktok.com/embed.js" strategy="lazyOnload" />
      )}
    </div>
  );
}

function PlayerModal({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const youtubeId = clip.link ? extractYouTubeVideoId(clip.link) : null;
  const tiktokId = clip.link ? extractTikTokVideoId(clip.link) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full overflow-hidden rounded-2xl border-2 border-white/20 bg-black ${!clip.videoUrl && tiktokId ? "max-w-sm" : "max-w-2xl"}`}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white hover:bg-yellow-400 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>
        {clip.videoUrl ? (
          <video src={clip.videoUrl} poster={clip.thumbnailUrl || undefined} className="aspect-video w-full bg-black" controls autoPlay playsInline />
        ) : youtubeId ? (
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
              title={clip.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : tiktokId && clip.link ? (
          <div className="max-h-[80vh] overflow-y-auto">
            <TikTokEmbed url={clip.link} videoId={tiktokId} author={clip.creatorName} caption={clip.title} />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-white/60">
            Couldn&apos;t load this video.
          </div>
        )}
      </div>
    </div>
  );
}
