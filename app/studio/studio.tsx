"use client";

import { useEffect, useRef, useState } from "react";
import type { JobView, NicheSearch, SavedSearch, SignalSummary } from "@/app/api/signal/signal";
import FormatCard from "./format-card";
import { USE_MOCK_GENERATE } from "./generate";
import RecentAds, { addRecentAd } from "./recent-ads";
import ScanProgress from "./scan-progress";
import { compact, sleep, thousands } from "./utils";

/** Matches DEFAULTS in app/api/signal/signal.ts, so a typed niche hits the same saved file. */
const DEFAULT_SEARCH: NicheSearch = {
  query: "saving money",
  platforms: ["instagram", "tiktok"],
  minFollowers: 5000,
  maxFollowers: 200000,
  days: 30,
  limit: 20,
};

export default function Studio() {
  const [brand, setBrand] = useState("Lodavo");
  const [niche, setNiche] = useState("");
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [job, setJob] = useState<JobView | null>(null);
  const [signal, setSignal] = useState<SignalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  // Each scan gets a number, so a slow old scan can't overwrite a newer one.
  const scanNumber = useRef(0);

  useEffect(() => {
    loadSaved();
    // /studio?q=saving%20money opens straight to that search: a safe bookmark for the stage.
    const linked = new URLSearchParams(window.location.search).get("q");
    if (linked) scan({ ...DEFAULT_SEARCH, query: linked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadSaved() {
    fetch("/api/signal/saved")
      .then((res) => res.json())
      .then((list) => Array.isArray(list) && setSaved(list))
      .catch(() => {});
  }

  async function scan(search?: NicheSearch) {
    const query = (search?.query ?? niche).trim();
    if (!query) return;
    if (search) setNiche(search.query);
    const mine = ++scanNumber.current;
    setError(null);
    setSignal(null);
    setJob(null);

    try {
      const res = await fetch("/api/signal/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Chips load the saved result instantly. A typed niche always goes to Oriane live.
        body: JSON.stringify(search ? { ...search, q: search.query } : { q: query, refresh: true }),
      });
      let view = (await res.json()) as JobView;
      if (!res.ok || !view.jobId) throw new Error(view.error ?? `Scan failed: HTTP ${res.status}`);

      while (mine === scanNumber.current) {
        if (view.status === "done" && view.result) {
          setJob(null);
          setLive(view.source !== "saved");
          setSignal(view.result);
          loadSaved();
          return;
        }
        if (view.status === "error") throw new Error(view.error ?? "Scan failed");
        setJob(view);
        await sleep(1000);
        const poll = await fetch(`/api/signal/scan?jobId=${view.jobId}`);
        view = (await poll.json()) as JobView;
        if (!poll.ok) throw new Error(view.error ?? `Scan failed: HTTP ${poll.status}`);
      }
    } catch (caught) {
      if (mine !== scanNumber.current) return;
      setJob(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const scanning = job !== null;

  return (
    <div className="flex-1 bg-zinc-950 font-sans text-zinc-100">
      <main className="mx-auto w-full max-w-6xl px-4 py-12 md:px-8 md:py-16">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Understudy Studio</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-7xl">
              What&apos;s working now,
              <br />
              <span className="text-zinc-500">remade as AI ads.</span>
            </h1>
          </div>
          {USE_MOCK_GENERATE && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-sm font-medium text-amber-300">
              Video generation: mock
            </span>
          )}
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            scan();
          }}
          className="mt-12 rounded-3xl border border-white/10 bg-zinc-900/60 p-6 md:p-8"
        >
          <div className="grid gap-5 md:grid-cols-[14rem_1fr_auto] md:items-end">
            <label className="block">
              <span className="text-sm font-medium text-zinc-400">Brand</span>
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3.5 text-xl outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-400">Niche</span>
              <input
                value={niche}
                onChange={(event) => setNiche(event.target.value)}
                placeholder="e.g. saving money, budgeting app"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3.5 text-xl outline-none placeholder:text-zinc-600 focus:border-emerald-400"
              />
            </label>
            <button
              type="submit"
              disabled={scanning || !niche.trim()}
              className="rounded-2xl bg-emerald-400 px-8 py-4 text-xl font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-40"
            >
              {scanning ? "Scanning…" : "Scan live"}
            </button>
          </div>

          {saved.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm text-zinc-500">Saved, instant:</span>
              {saved.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  disabled={scanning}
                  onClick={() => scan(item.search)}
                  className={`rounded-full border px-4 py-2 text-base transition disabled:opacity-40 ${
                    signal?.slug === item.slug
                      ? "border-emerald-400 bg-emerald-400/15 text-emerald-200"
                      : "border-white/15 text-zinc-200 hover:border-white/40"
                  }`}
                >
                  {item.search.query}
                  <span className="ml-2 text-zinc-500">{item.formats} formats</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {error && (
          <p className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-lg text-red-300">{error}</p>
        )}

        {job && (
          <div className="mt-10">
            <ScanProgress job={job} />
          </div>
        )}

        {signal && (
          <section className="mt-14">
            <p
              className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${
                live ? "bg-emerald-400 text-black" : "border border-white/15 text-zinc-400"
              }`}
            >
              {live && <span className="h-2 w-2 animate-pulse rounded-full bg-black" />}
              {live ? "Live from Oriane" : "Saved scan"} ·{" "}
              {new Date(signal.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
            <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Analysed {signal.videosAnalysed} videos <span className="text-zinc-600">→</span>{" "}
              <span className="text-emerald-400">
                {signal.briefs.length} winning {signal.briefs.length === 1 ? "format" : "formats"}
              </span>
            </h2>
            <p className="mt-4 max-w-4xl text-lg text-zinc-400">
              “{signal.search.query}”: the top {signal.videosAnalysed}
              {signal.totalMatches ? ` of ${compact(signal.totalMatches)}` : ""} organic{" "}
              {signal.search.platforms.map((name) => (name === "tiktok" ? "TikTok" : name === "instagram" ? "Instagram" : "YouTube")).join(" and ")}{" "}
              videos from {thousands(signal.search.minFollowers)}–{thousands(signal.search.maxFollowers)} follower
              creators in the last {signal.search.days} days, ranked by views per follower.{" "}
              {signal.rejectedCount > 0 && `${signal.rejectedCount} dropped as off-topic or paid reach.`}
            </p>

            <div className="mt-10 space-y-10">
              {signal.briefs.map((brief, index) => (
                <FormatCard
                  key={`${signal.slug}:${brief.id}`}
                  rank={index + 1}
                  brief={brief}
                  brand={brand.trim() || "Lodavo"}
                  signalSlug={signal.slug}
                  onFinished={addRecentAd}
                />
              ))}
            </div>
          </section>
        )}

        {!signal && !job && !error && (
          <p className="mt-16 text-center text-xl text-zinc-600">
            Pick a saved search for an instant result, or type a niche and scan Oriane live (about 30 seconds).
          </p>
        )}

        <RecentAds />
      </main>
    </div>
  );
}
