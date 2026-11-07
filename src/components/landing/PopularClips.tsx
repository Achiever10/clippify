"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye, Film, Heart, Play } from "lucide-react";
import { loadLandingStats, type PopularClip } from "@/lib/landing-stats";

export default function PopularClips() {
  const [clips, setClips] = useState<PopularClip[] | null>(null);

  useEffect(() => {
    loadLandingStats()
      .then((data) => setClips(data.popularClips ?? []))
      .catch(() => setClips([]));
  }, []);

  // Hides itself rather than showing an empty section — real content or nothing,
  // never a placeholder pretending to be real (see src/components/landing/TopCreators.tsx).
  if (clips !== null && clips.length === 0) return null;

  return (
    <section id="clips" className="bg-white py-20 dark:bg-[#0a0a0a]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            Popular Clips
          </h2>
          <Link
            href="/dashboard/browse"
            className="group flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-yellow-400 dark:hover:text-yellow-300"
          >
            View all clips{" "}
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mt-8 -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {(clips ?? Array.from({ length: 4 })).map((clip, i) => (
            <Link
              key={clip ? `${clip.title}-${i}` : i}
              href="/dashboard/browse"
              className="group w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-100 shadow-sm shadow-slate-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-[#111] dark:shadow-none sm:w-auto"
            >
              <div className="relative flex aspect-video items-center justify-center bg-slate-900">
                {clip?.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clip.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <Film className="h-7 w-7 text-white/20" />
                )}
                {clip && (
                  <>
                    <div className="absolute inset-0 bg-black/25" />
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur transition-all duration-300 group-hover:scale-110 group-hover:bg-white/25">
                      <Play className="h-4 w-4 fill-white text-white" />
                    </span>
                  </>
                )}
              </div>
              <div className="p-4">
                {clip ? (
                  <>
                    <h3 className="truncate font-semibold text-slate-900 dark:text-white">{clip.title}</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{clip.creatorName}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> {clip.viewCount.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" /> {clip.likeCount.toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-white/10" />
                    <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-white/10" />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
