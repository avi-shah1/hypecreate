"use client";

import type { JobView } from "@/app/api/signal/signal";
import { thousands } from "./utils";

const ORDER = ["searching", "filtering", "frames", "grouping"] as const;

export default function ScanProgress({ job }: { job: JobView }) {
  const current = ORDER.indexOf(job.stage as (typeof ORDER)[number]);
  const labels = {
    searching: "Searching Oriane",
    filtering: `Filtering organic ${thousands(job.search.minFollowers)}–${thousands(job.search.maxFollowers)} creators`,
    frames:
      job.framesTotal != null
        ? `Analysing frames ${job.framesDone ?? 0}/${job.framesTotal}`
        : "Analysing frames",
    grouping: "Grouping formats",
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-900/60 p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Scanning “{job.search.query}”</h2>
        <span className="font-mono text-lg tabular-nums text-zinc-400">{Math.floor(job.elapsedMs / 1000)}s</span>
      </div>

      <ol className="mt-6 grid gap-3 md:grid-cols-4">
        {ORDER.map((stage, index) => {
          const state = index < current ? "done" : index === current ? "active" : "waiting";
          return (
            <li
              key={stage}
              className={`rounded-2xl border p-4 transition-colors ${
                state === "active"
                  ? "border-emerald-400/60 bg-emerald-400/10"
                  : state === "done"
                    ? "border-white/10 bg-white/5"
                    : "border-white/5 opacity-40"
              }`}
            >
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                {state === "done" ? (
                  <span className="text-emerald-400">✓</span>
                ) : state === "active" ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                ) : (
                  <span>{index + 1}</span>
                )}
                <span>Step {index + 1}</span>
              </div>
              <p className="mt-2 text-lg font-medium leading-snug">{labels[stage]}</p>
              {stage === "frames" && job.framesTotal ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.round(((job.framesDone ?? 0) / job.framesTotal) * 100)}%` }}
                  />
                </div>
              ) : null}
              {stage === "grouping" && state === "active" ? (
                <p className="mt-2 font-mono text-sm tabular-nums text-zinc-400">
                  {Math.floor(job.stageElapsedMs / 1000)}s · usually under a minute
                </p>
              ) : null}
              {state === "done" && job.notes?.[stage] ? (
                <p className="mt-2 text-sm leading-snug text-zinc-400">{job.notes[stage]}</p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-zinc-400">{job.detail}</p>
    </section>
  );
}
