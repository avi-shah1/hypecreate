"use client";

import { useEffect, useRef, useState } from "react";
import type { Beat, Evidence, FormatBrief } from "@/lib/contract";
import { GENERATE_POLL_MS, getGenerate, startGenerate, USE_MOCK_GENERATE, type GenerateStatus } from "./generate";
import { compact, multiple, sleep, span } from "./utils";
import type { StudioVideo } from "./videos/route";

interface Props {
  rank: number;
  brief: FormatBrief;
  brand: string;
  signalSlug: string;
  /** Videos already made for this format: instant to show, and the fallback if GMI fails. */
  ready: StudioVideo[];
  onFinished: () => void;
}

export default function FormatCard({ rank, brief, brand, signalSlug, ready, onFinished }: Props) {
  const [generation, setGeneration] = useState<GenerateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = generation?.status === "queued" || generation?.status === "running";
  const result = generation?.status === "done" ? generation.result : undefined;

  function showReady(video: StudioVideo) {
    setError(null);
    setGeneration({
      jobId: video.url,
      status: "done",
      result: { videoUrl: video.url, beats: video.beats, caption: video.caption, script: "" },
    });
  }

  async function generate() {
    setError(null);
    setStartedAt(Date.now());
    try {
      const { jobId } = await startGenerate({ signalSlug, formatId: brief.id, brand }, brief);
      let status: GenerateStatus = { jobId, status: "queued", stage: "Queued" };
      while (mounted.current) {
        setGeneration(status);
        if (status.status === "done") {
          onFinished();
          return;
        }
        if (status.status === "error") throw new Error(status.error ?? "Generation failed");
        await sleep(GENERATE_POLL_MS);
        status = await getGenerate(jobId);
      }
    } catch (caught) {
      if (!mounted.current) return;
      setGeneration(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <article className="rounded-3xl border border-white/10 bg-zinc-900/50 p-6 md:p-10">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Format {rank}</p>
          <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{brief.name}</h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Signal</p>
          <p className="text-4xl font-semibold tabular-nums">{Math.round(brief.score * 100)}</p>
        </div>
      </header>

      <blockquote className="mt-6 border-l-4 border-emerald-400 pl-5 text-2xl leading-snug text-zinc-100 md:text-3xl">
        <Hook pattern={brief.hookPattern} />
      </blockquote>
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-zinc-400">{brief.whyItWorks}</p>

      <Timeline beats={brief.beats} duration={brief.durationSeconds} />

      <div className="mt-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Evidence · {brief.evidence.length} real {brief.evidence.length === 1 ? "video" : "videos"}
        </p>
        <div className="mt-4 flex gap-5 overflow-x-auto pb-2">
          {brief.evidence.map((video) => (
            <EvidenceTile key={video.url} video={video} />
          ))}
        </div>
      </div>

      <div className="mt-10 border-t border-white/10 pt-8">
        {!result && (
          <div className="flex flex-wrap items-center gap-5">
            <button
              onClick={generate}
              disabled={busy}
              className="rounded-full bg-white px-7 py-3.5 text-lg font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Generating…" : `Generate ${brand || "brand"} ad`}
            </button>
            {!busy && !USE_MOCK_GENERATE && (
              <p className="text-zinc-500">Veo 3.1 Fast via GMI · 8 s with sound · about $1.20 · 1–3 min</p>
            )}
            {busy && generation && (
              <p className="flex items-center gap-3 text-lg text-zinc-300">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                {generation.stage ?? "Working"}
                <Elapsed since={startedAt} />
              </p>
            )}
            {error && <p className="w-full text-lg text-red-400">{error}</p>}
            {!busy && ready.length > 0 && (
              <div className="flex w-full flex-wrap items-center gap-3">
                <span className="text-zinc-500">Ready-made:</span>
                {ready.map((video) => (
                  <button
                    key={video.url}
                    onClick={() => showReady(video)}
                    className="rounded-full border border-violet-400/50 bg-violet-400/10 px-5 py-2.5 text-lg font-medium text-violet-200 transition hover:border-violet-300"
                  >
                    ▶ {video.model ?? "GMI"} ad
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="grid gap-8 md:grid-cols-[minmax(0,18rem)_1fr]">
            <div className="relative mx-auto aspect-[9/16] w-full max-w-72 overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video src={result.videoUrl} className="h-full w-full object-cover" controls autoPlay muted loop playsInline />
              <span className="absolute left-3 top-3 rounded-full bg-violet-500/90 px-3 py-1 text-sm font-semibold">
                AI-generated
              </span>
              {USE_MOCK_GENERATE && (
                <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-sm font-semibold text-black">
                  mock
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
                {brand} script · {brief.name}
              </p>
              {result.beats?.length ? (
                <ol className="mt-4 space-y-4">
                  {result.beats.map((beat, index) => (
                    <li key={index} className="grid grid-cols-[4.5rem_1fr] gap-4">
                      <span className="pt-1 font-mono text-sm tabular-nums text-zinc-500">{span(beat)}</span>
                      <div>
                        {beat.says && <p className="text-xl leading-snug">“{beat.says}”</p>}
                        {beat.onScreen && <OnScreen text={beat.onScreen} />}
                        <p className="mt-1 text-sm text-zinc-500">{beat.shows}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 whitespace-pre-wrap text-xl leading-snug">{result.script}</p>
              )}
              {result.caption && (
                <p className="mt-6 rounded-2xl bg-white/5 p-4 text-zinc-300">
                  <span className="text-zinc-500">Caption: </span>
                  {result.caption}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={generate}
                  className="rounded-full border border-white/20 px-5 py-2 text-zinc-300 transition hover:border-white/50"
                >
                  Generate another
                </button>
                {ready
                  .filter((video) => video.url !== result.videoUrl)
                  .map((video) => (
                    <button
                      key={video.url}
                      onClick={() => showReady(video)}
                      className="rounded-full border border-violet-400/40 px-5 py-2 text-violet-200 transition hover:border-violet-300"
                    >
                      ▶ {video.model ?? "GMI"} version
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/** The hook with its [blanks] highlighted. */
function Hook({ pattern }: { pattern: string }) {
  return (
    <>
      “
      {pattern.split(/(\[[^\]]+\])/).map((part, index) =>
        part.startsWith("[") ? (
          <span key={index} className="rounded-md bg-emerald-400/15 px-1.5 text-emerald-300">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
      ”
    </>
  );
}

function Timeline({ beats, duration }: { beats: Beat[]; duration: number }) {
  const total = Math.max(duration, beats.at(-1)?.toSeconds ?? 0, 1);
  const shades = ["bg-emerald-400", "bg-sky-400", "bg-violet-400", "bg-amber-300", "bg-rose-400", "bg-teal-300"];
  return (
    <div className="mt-10">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Beats · {Math.round(total)} seconds
      </p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/5">
        {beats.map((beat, index) => (
          <div
            key={index}
            className={`${shades[index % shades.length]} border-r-2 border-zinc-950 last:border-r-0`}
            style={{ width: `${(Math.max(beat.toSeconds - beat.fromSeconds, 0.5) / total) * 100}%` }}
          />
        ))}
      </div>
      <ol className="mt-5 space-y-5">
        {beats.map((beat, index) => (
          <li key={index} className="grid grid-cols-[4.5rem_1fr] gap-4">
            <span className="flex items-start gap-2 pt-0.5 font-mono text-sm tabular-nums text-zinc-400">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${shades[index % shades.length]}`} />
              {span(beat)}
            </span>
            <div>
              <p className="text-lg text-zinc-200">{beat.shows}</p>
              {beat.says && <p className="mt-1 text-lg italic text-zinc-400">“{beat.says}”</p>}
              {beat.onScreen && <OnScreen text={beat.onScreen} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OnScreen({ text }: { text: string }) {
  return (
    <p className="mt-2 inline-block rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-black">
      <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">text</span>
      {text}
    </p>
  );
}

function EvidenceTile({ video }: { video: Evidence }) {
  const image = video.thumbnailUrl ?? video.frameUrls[0];
  return (
    <div className="w-44 shrink-0">
      <a
        href={video.url}
        target="_blank"
        rel="noreferrer"
        className="group relative block aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-zinc-800"
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={`Video by @${video.handle}`}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium">
          {{ tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" }[video.platform]}
        </span>
        <span className="absolute inset-x-2 bottom-2 rounded-xl bg-emerald-400 px-2 py-1.5 text-center text-lg font-black leading-none text-black">
          {multiple(video.viewsPerFollower)} followers
        </span>
      </a>
      <p className="mt-2 truncate font-medium">@{video.handle}</p>
      <p className="text-sm text-zinc-400">
        {compact(video.views)} views · {compact(video.followers)} followers
      </p>
      {video.topComments.slice(0, 2).map((comment, index) => (
        <p key={index} className="mt-2 line-clamp-2 text-sm italic text-zinc-500">
          “{comment}”
        </p>
      ))}
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-base tabular-nums text-zinc-500">{Math.max(0, Math.floor((now - since) / 1000))}s</span>;
}
