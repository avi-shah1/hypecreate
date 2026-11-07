// The Studio's backend, which it reaches with GENERATE_WITH = "ben".
//   POST /api/generate {signalSlug, formatId, brand, style?, person?, fresh?} -> {jobId}
//   GET  /api/generate?jobId=                                                -> status, then the video
// Real clips from the library when this machine has the footage. A laptop without it
// falls back to the Studio's AI presenter (app/studio/generate), so the demo runs anywhere.
// A format already made in the same style comes back at once unless `fresh` is set:
// a script takes over a minute, which is too long to wait on stage.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getGeneration, startGeneration } from "@/app/studio/generate/pipeline";
import type { FormatBrief, VideoStyle } from "@/lib/contract";
import { createVideo, type CreatedVideo } from "@/lib/create";
import { loadLibrary } from "@/lib/library";

interface Job {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  result?: CreatedVideo;
  error?: string;
}

const registry = globalThis as typeof globalThis & { __createJobs?: Map<string, Job> };
const jobs = (registry.__createJobs ??= new Map<string, Job>());

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const hasFootage = await loadLibrary(body.person ?? "chaerin").then(
      (clips) => clips.length > 0,
      () => false,
    );
    const aiReady = body.style === "ai-generated" && !body.fresh && (await savedVideo(`${body.formatId}-ai-generated`));
    if (!hasFootage || (body.style === "ai-generated" && !aiReady)) {
      return Response.json({ jobId: (await startGeneration(body)).jobId });
    }

    const brief = await findFormat(String(body.signalSlug ?? ""), String(body.formatId ?? ""));
    const job: Job = { jobId: crypto.randomUUID(), status: "running", stage: "Starting" };
    jobs.set(job.jobId, job);
    run(job, brief, body).catch((error) => {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
      console.error(`generate ${job.jobId}:`, error);
    });
    return Response.json({ jobId: job.jobId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId) ?? getGeneration(jobId);
  if (!job) return Response.json({ error: "No such job. The server may have restarted." }, { status: 404 });
  return Response.json(job);
}

async function run(
  job: Job,
  brief: FormatBrief,
  body: { brand?: string; style?: VideoStyle; person?: string; fresh?: boolean },
) {
  // A format from an account's own results is remade the way it won: b-roll with nobody on camera.
  const own = brief.evidence.every((video) => video.frameUrls.length === 0);
  const style = body.style ?? (own ? "broll-text" : "hook-plus-demo");
  const slug = `${brief.id}-${style}`;
  const saved = savedPath(slug);
  if (!body.fresh) {
    const previous = await savedVideo(slug);
    if (previous) {
      job.result = previous;
      job.stage = "Done";
      job.status = "done";
      return;
    }
  }
  job.result = await createVideo(
    { brief, style, brand: body.brand ?? "Lodavo", language: "en", person: body.person ?? (own ? "faceless" : "chaerin"), slug, folder: "made-live" },
    (stage) => (job.stage = stage),
  );
  await writeFile(saved, JSON.stringify({ ...job.result, formatId: brief.id, formatName: brief.name, model: STYLE_NAMES[style] }));
  job.stage = "Done";
  job.status = "done";
}

const STYLE_NAMES: Record<VideoStyle, string> = {
  "hook-plus-demo": "Real clips + app demo",
  "broll-text": "7-second b-roll",
  "ai-generated": "AI-generated",
};

function savedPath(slug: string): string {
  return path.join(process.cwd(), "public", "renders", "made-live", `${slug}.json`);
}

async function savedVideo(slug: string): Promise<CreatedVideo | null> {
  const previous = await readFile(savedPath(slug), "utf8").catch(() => null);
  return previous ? JSON.parse(previous) : null;
}

async function findFormat(slug: string, formatId: string): Promise<FormatBrief> {
  if (!/^[a-z0-9+_-]+$/.test(slug)) throw new Error("signalSlug is missing or malformed");
  const signal = JSON.parse(await readFile(path.join(process.cwd(), "data", "signal", `${slug}.json`), "utf8"));
  const brief = (signal.briefs as FormatBrief[]).find((candidate) => candidate.id === formatId);
  if (!brief) throw new Error(`No format "${formatId}" in ${slug}`);
  return brief;
}
