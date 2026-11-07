"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye } from "lucide-react";
import { loadLandingStats, type TopCreator } from "@/lib/landing-stats";

const palette = [
  "bg-amber-500 text-black",
  "bg-slate-800 text-white",
  "bg-orange-500 text-white",
  "bg-sky-500 text-white",
  "bg-slate-600 text-white",
];

export default function TopCreators() {
  const [creators, setCreators] = useState<TopCreator[] | null>(null);

  useEffect(() => {
    loadLandingStats()
      .then((data) => setCreators(data.topCreators ?? []))
      .catch(() => setCreators([]));
  }, []);

  // Hides itself rather than showing an empty section, or fabricated names/follower
  // counts and a "+Follow" button with no follow feature behind it — what this
  // section used to be.
  if (creators !== null && creators.length === 0) return null;

  return (
    <section id="creators" className="bg-slate-50 py-20 dark:bg-[#0a0a0a]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            Top Clipper Creators
          </h2>
          <Link
            href="/dashboard/browse"
            className="group flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-yellow-400 dark:hover:text-yellow-300"
          >
            Browse clips{" "}
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mt-8 -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {(creators ?? Array.from({ length: 5 })).map((c, i) => (
            <div
              key={c ? c.creatorName : i}
              className="group w-48 shrink-0 snap-start rounded-2xl bg-white p-5 text-center shadow-sm shadow-slate-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:bg-[#111] dark:shadow-none sm:w-auto"
            >
              {c ? (
                <>
                  <span
                    className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold transition-transform duration-300 group-hover:scale-110 ${palette[i % palette.length]}`}
                  >
                    {c.creatorName.charAt(0).toUpperCase()}
                  </span>
                  <p className="mt-3 truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {c.creatorName}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-yellow-400">#{i + 1} this month</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {c.clipCount} {c.clipCount === 1 ? "clip" : "clips"}
                  </p>
                  <p className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Eye className="h-3 w-3" /> {c.totalViews.toLocaleString()} views
                  </p>
                </>
              ) : (
                <div className="animate-pulse">
                  <div className="mx-auto h-14 w-14 rounded-full bg-slate-100 dark:bg-white/10" />
                  <div className="mx-auto mt-3 h-4 w-20 rounded bg-slate-100 dark:bg-white/10" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
