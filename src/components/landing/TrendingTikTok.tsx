"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import TikTokEmbed from "@/components/TikTokEmbed";

const videos = [
  {
    url: "https://www.tiktok.com/@natgeo/video/7509066418168597791",
    videoId: "7509066418168597791",
    author: "natgeo",
    caption: "Spring in Patagonia is a time of abundance for this puma mother and her cubs.",
  },
  {
    url: "https://www.tiktok.com/@duolingo/video/7460972535832644907",
    videoId: "7460972535832644907",
    author: "duolingo",
    caption: "hope we don't regret posting this on Monday!",
  },
  {
    url: "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    videoId: "6718335390845095173",
    author: "scout2015",
    caption: "Scramble up ur name & I'll try to guess it",
  },
];

export default function TrendingTikTok() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="bg-slate-50 py-20 dark:bg-[#0a0a0a]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
            Trending on{" "}
            <span className="bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-transparent dark:from-yellow-300 dark:to-amber-400">
              TikTok
            </span>
          </h2>
          <p className="mt-3 text-slate-500 dark:text-slate-400">
            Real, live clips — the kind of scroll-stopping content creators
            share and brands discover through Clippifi.
          </p>
        </div>

        <div className="mt-12 grid min-h-[28rem] grid-cols-1 justify-items-center gap-8 sm:grid-cols-3">
          {active &&
            videos.map((v) => (
              <div
                key={v.videoId}
                className="w-full max-w-[325px] overflow-hidden rounded-2xl bg-neutral-100 shadow-2xl shadow-black/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-yellow-500/10"
              >
                <TikTokEmbed
                  url={v.url}
                  videoId={v.videoId}
                  author={v.author}
                  caption={v.caption}
                />
              </div>
            ))}
        </div>
      </div>

      {active && <Script src="https://www.tiktok.com/embed.js" strategy="lazyOnload" />}
    </section>
  );
}
