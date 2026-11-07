// The studio's way into the signal pipeline, so it can show real progress.
//   POST /api/signal/scan           same params as /api/signal; returns a JobView.
//                                   Saved searches come back already done.
//   GET  /api/signal/scan?jobId=…   the job's current stage, and its result when done.
import { getJob, readMode, readSearch, startJob, viewOf } from "../signal";

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = await request.json().catch(() => ({}));
  const body = parsed && typeof parsed === "object" ? parsed : {};
  const job = startJob(readSearch(params, body), readMode(params, body));
  // A saved search finishes in milliseconds: wait a moment so it arrives in this response.
  await Promise.race([job.done.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 1000))]);
  return Response.json(viewOf(job));
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  const job = jobId ? getJob(jobId) : null;
  if (!job) {
    return Response.json({ error: "No such scan. The server may have restarted, so scan again." }, { status: 404 });
  }
  return Response.json(viewOf(job));
}
