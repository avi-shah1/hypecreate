"use client";

import { useSyncExternalStore } from "react";

export interface RecentAd {
  id: string;
  brand: string;
  formatName: string;
  videoUrl: string;
  createdAt: string;
  mock: boolean;
}

// Finished ads live in this browser's localStorage, so the gallery survives a reload.
const KEY = "studio.recentAds";
const NONE: RecentAd[] = [];
const listeners = new Set<() => void>();
let cache: RecentAd[] | null = null;

function read(): RecentAd[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentAd[];
  } catch {
    cache = []; // Private window or blocked storage: start empty.
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addRecentAd(ad: RecentAd) {
  cache = [ad, ...read().filter((item) => item.id !== ad.id)].slice(0, 12);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Not fatal: the gallery just won't survive a reload.
  }
  listeners.forEach((listener) => listener());
}

export default function RecentAds() {
  const ads = useSyncExternalStore(subscribe, read, () => NONE);
  if (ads.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="text-3xl font-semibold tracking-tight">Recent ads</h2>
      <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        {ads.map((ad) => (
          <figure key={ad.id}>
            <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video
                src={ad.videoUrl}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
                onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
                onMouseLeave={(event) => event.currentTarget.pause()}
              />
              <span className="absolute left-2 top-2 rounded-full bg-violet-500/90 px-2 py-0.5 text-xs font-semibold">
                AI-generated
              </span>
              {ad.mock && (
                <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-black">
                  mock
                </span>
              )}
            </div>
            <figcaption className="mt-2">
              <p className="font-medium leading-snug">{ad.formatName}</p>
              <p className="text-sm text-zinc-500">
                {ad.brand} · {new Date(ad.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
