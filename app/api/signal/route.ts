// POST or GET /api/signal: the formats working right now, as FormatBrief[].
// The pipeline and both cache layers live in ./signal.ts.
//
// Default: return the saved formats. New searches fetch live and save.
//   ?refresh=1    fetch Oriane again, then re-run the LLM
//   ?reanalyze=1  re-run the LLM on the saved Oriane results only
//
// Search params (query string or JSON body), all optional:
//   q            words to find, commas for alternatives   default "saving money"
//   platforms    tiktok,instagram                         default both
//   minFollowers, maxFollowers                            default 5000, 200000
//   days         published in the last N days             default 30
//   limit        videos to fetch, 1 to 100                default 20
//
// The studio uses /api/signal/scan instead, which reports progress while it runs.
import { readMode, readSearch, startJob } from "./signal";

export async function GET(request: Request) {
  return handle(request, {});
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return handle(request, body && typeof body === "object" ? body : {});
}

async function handle(request: Request, body: Record<string, unknown>) {
  const params = new URL(request.url).searchParams;
  const job = startJob(readSearch(params, body), readMode(params, body));
  try {
    const summary = await job.done;
    return Response.json(summary.briefs, {
      headers: { "x-signal-source": job.source ?? "", "x-signal-slug": job.slug },
    });
  } catch {
    return Response.json(
      { error: job.error, slug: job.slug },
      { status: job.errorStatus ?? 502, headers: { "x-signal-slug": job.slug } },
    );
  }
}
