"use client";

import { useEffect, useState } from "react";
import type { CreateResult, FormatBrief, VideoStyle } from "@/lib/contract";

const STYLES: { style: VideoStyle; label: string }[] = [
  { style: "hook-plus-demo", label: "Real clip + app demo" },
  { style: "broll-text", label: "7-second b-roll" },
  { style: "ai-generated", label: "AI-generated" },
];

type Gallery = { account: string; videos: { url: string; notes: string }[] }[];

export default function Home() {
  const [briefs, setBriefs] = useState<FormatBrief[]>([]);
  const [gallery, setGallery] = useState<Gallery>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, CreateResult | string>>({});

  useEffect(() => {
    fetch("/api/signal", { method: "POST" })
      .then((res) => res.json())
      .then(setBriefs);
    fetch("/api/renders")
      .then((res) => res.json())
      .then(setGallery);
  }, []);

  async function make(brief: FormatBrief, style: VideoStyle) {
    setWorking(`${brief.id}:${style}`);
    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, style, brand: "lodavo", language: "en", person: "chaerin", folder: "made-live" }),
    });
    const json = await res.json();
    setMade((current) => ({ ...current, [brief.id]: res.ok ? json : json.error }));
    setWorking(null);
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Hack the Feed</h1>
      <p className="mt-1 text-zinc-500">The formats working right now, remade from your team&apos;s own clips.</p>

      <h2 className="mt-8 text-2xl font-semibold">What&apos;s working right now</h2>
      {briefs.map((brief) => {
        const result = made[brief.id];
        return (
          <section key={brief.id} className="mt-6 rounded-xl border border-zinc-300 p-5">
            <h3 className="text-xl font-semibold">{brief.name}</h3>
            <p className="mt-1 italic">{brief.hookPattern}</p>
            <p className="mt-2 text-zinc-500">{brief.whyItWorks}</p>

            <div className="mt-4 flex flex-wrap gap-4">
              {brief.evidence.map((video) => (
                <a key={video.url} href={video.url} target="_blank" rel="noreferrer" className="w-40">
                  {video.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.thumbnailUrl} alt={`Video by @${video.handle}`} className="rounded-lg" />
                  )}
                  <p className="mt-1 text-sm">
                    {video.views.toLocaleString()} views, {Math.round(video.viewsPerFollower)}x followers
                  </p>
                  <p className="text-sm text-zinc-500">@{video.handle}</p>
                </a>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {STYLES.map(({ style, label }) => (
                <button
                  key={style}
                  onClick={() => make(brief, style)}
                  disabled={working !== null}
                  className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
                >
                  {working === `${brief.id}:${style}` ? "Making it..." : label}
                </button>
              ))}
            </div>

            {typeof result === "string" && <p className="mt-3 text-red-600">{result}</p>}
            {result && typeof result !== "string" && (
              <div className="mt-4">
                <video src={result.videoUrl} controls className="max-h-[600px] rounded-lg" />
                <p className="mt-2 whitespace-pre-wrap">{result.caption}</p>
              </div>
            )}
          </section>
        );
      })}

      {gallery.map((group) => (
        <section key={group.account} className="mt-10">
          <h2 className="text-2xl font-semibold">
            Ready to post: {group.account} ({group.videos.length})
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {group.videos.map((video) => (
              <video key={video.url} src={video.url} controls preload="metadata" className="rounded-lg" />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
