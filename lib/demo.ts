// Demo mode: the public site never calls Oriane or GMI, so nobody can spend credits.
//   Scans answer from the saved searches in data/signal (a typed niche gets the closest one).
//   "Make a video" answers with one of the videos already made, in public/demo, after a short run-through.
// It is on unless HYPECREATE_LIVE=1. Set that only on a machine with your own keys in .env.local.
import type { Beat } from "./contract";
import demoVideos from "@/data/demo-videos.json";

export const DEMO_MODE = process.env.HYPECREATE_LIVE !== "1";

export interface DemoVideo {
  url: string;
  name: string;
  model: string | null;
  formatId: string | null;
  createdAt: string;
  caption?: string;
  beats?: Beat[];
}

export const DEMO_VIDEOS = demoVideos as DemoVideo[];

/** How long the run-through takes before the video appears. */
const RUN_MS = 1500;
const STAGES = ["Writing the script", "Generating scenes", "Adding the legal line"];

/** A video made for this format if there is one, otherwise a steady pick from the rest. */
function pick(formatId: string, style: string): number {
  const own = DEMO_VIDEOS.map((video, index) => ({ video, index })).filter(({ video }) => video.formatId === formatId);
  const pool = own.length ? own : DEMO_VIDEOS.map((video, index) => ({ video, index })).filter(({ video }) => video.beats?.length);
  let hash = 0;
  for (const char of `${formatId}:${style}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length].index;
}

/**
 * The job lives in its id ("demo-<video>-<started>"), not in server memory,
 * so it still works when the host answers each request from a different machine.
 */
export function startDemoGeneration(body: { formatId?: unknown; style?: unknown }): { jobId: string } {
  return { jobId: `demo-${pick(String(body.formatId ?? ""), String(body.style ?? ""))}-${Date.now()}` };
}

export function getDemoGeneration(jobId: string) {
  const match = /^demo-(\d+)-(\d+)$/.exec(jobId);
  const video = match ? DEMO_VIDEOS[Number(match[1])] : undefined;
  if (!match || !video) return null;

  const elapsed = Date.now() - Number(match[2]);
  if (elapsed < RUN_MS) {
    const stage = STAGES[Math.min(STAGES.length - 1, Math.floor((elapsed / RUN_MS) * STAGES.length))];
    return { jobId, status: "running" as const, stage };
  }
  return {
    jobId,
    status: "done" as const,
    stage: "Done",
    result: {
      videoUrl: video.url,
      caption: video.caption ?? "",
      script: (video.beats ?? []).map((beat) => beat.says).filter(Boolean).join("\n"),
      beats: video.beats ?? [],
      style: "ai-generated" as const,
      clipsUsed: [],
      generationCostUsd: 0,
    },
  };
}
