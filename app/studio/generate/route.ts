// POST /studio/generate {signalSlug, formatId, brand} -> {jobId}
// GET  /studio/generate?jobId=                       -> status, then the video
// Real GMI generation for the studio. It lives here, not at /api/generate,
// so it can't collide with Ben's route. See ./pipeline.ts. In demo mode
// (lib/demo.ts) it answers with a video already made and calls nothing.
import { DEMO_MODE, getDemoGeneration, startDemoGeneration } from "@/lib/demo";
import { getGeneration, startGeneration } from "./pipeline";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (DEMO_MODE) return Response.json(startDemoGeneration(body ?? {}));
  try {
    const job = await startGeneration(body && typeof body === "object" ? body : {});
    return Response.json({ jobId: job.jobId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  const job = jobId ? (DEMO_MODE ? getDemoGeneration(jobId) : getGeneration(jobId)) : null;
  if (!job) return Response.json({ error: "No such job. The server may have restarted." }, { status: 404 });
  return Response.json(job);
}
