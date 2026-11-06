"use client";

import { useEffect, useState } from "react";
import type { CreateResult, FormatBrief } from "@/lib/contract";

export default function Home() {
  const [briefs, setBriefs] = useState<FormatBrief[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, CreateResult | string>>({});

  useEffect(() => {
    fetch("/api/signal", { method: "POST" })
      .then((res) => res.json())
      .then(setBriefs);
  }, []);

  async function make(brief: FormatBrief) {
    setWorking(brief.id);
    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, brand: "lodavo", language: "en" }),
    });
    const json = await res.json();
    setMade((current) => ({ ...current, [brief.id]: res.ok ? json : json.error }));
    setWorking(null);
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="text-3xl font-bold">Understudy</h1>
      <p className="mt-1 text-zinc-500">The formats working right now, remade for your accounts.</p>

      {briefs.map((brief) => {
        const result = made[brief.id];
        return (
          <section key={brief.id} className="mt-6 rounded-xl border border-zinc-300 p-5">
            <h2 className="text-xl font-semibold">{brief.name}</h2>
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

            <button
              onClick={() => make(brief)}
              disabled={working !== null}
              className="mt-4 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {working === brief.id ? "Making it..." : "Make this video"}
            </button>

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
    </main>
  );
}
