// The signal pipeline, shared by /api/signal (returns FormatBrief[] for the main
// page) and /api/signal/scan (the studio: start a job, then poll its stage).
//
// Two saved layers, both committed so the demo and the other laptop never wait:
//   data/oriane/<slug>.json   raw Oriane results for a search
//   data/signal/<slug>.json   the formats the LLM made from them
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FormatBrief, Platform } from "@/lib/contract";
import { DEMO_MODE } from "@/lib/demo";
import { nicheQuery, searchContents, type NicheSearch, type OrianeContent } from "@/lib/oriane";
import { analyze, MAX_VIDEOS, SIGNAL_MODEL, type Analysis, type Progress } from "./analyze";

export type { NicheSearch, Progress };

export const DEFAULTS: NicheSearch = {
  query: "saving money",
  platforms: ["tiktok", "instagram"],
  minFollowers: 5000,
  maxFollowers: 200000,
  days: 30,
  limit: 20,
};

const ORIANE_DIR = path.join(process.cwd(), "data", "oriane");
const SIGNAL_DIR = path.join(process.cwd(), "data", "signal");

interface SavedOriane {
  search: NicheSearch;
  fetchedAt: string;
  totalCount: number;
  oriane: unknown;
  results: OrianeContent[];
}

interface SavedSignal extends Omit<Analysis, "usedImages"> {
  search: NicheSearch;
  generatedAt: string;
  model: string;
  usedImages: boolean;
  orianeFile: string;
  /** Older files lack these two; summarize() reads them from the Oriane file instead. */
  videosAnalysed?: number;
  totalMatches?: number;
}

export type Mode = "default" | "refresh" | "reanalyze";
type Source = "saved" | "live" | "refreshed" | "reanalyzed" | "from-saved-oriane";

/** The formats plus the numbers behind them, for the studio header. */
export interface SignalSummary {
  slug: string;
  search: NicheSearch;
  briefs: FormatBrief[];
  videosAnalysed: number;
  rejectedCount: number;
  totalMatches: number | null;
  generatedAt: string;
}

/** A saved search the studio can load instantly. */
export interface SavedSearch {
  slug: string;
  search: NicheSearch;
  formats: number;
  generatedAt: string;
}

class NotSaved extends Error {}

// ---------------------------------------------------------------------------
// Reading a search from a request

export function readSearch(params: URLSearchParams, body: Record<string, unknown>): NicheSearch {
  const get = (name: string) => params.get(name) ?? (body[name] == null ? null : String(body[name]));
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(get(name));
    return get(name) != null && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  };
  const query = (get("q") ?? get("query") ?? DEFAULTS.query)
    .split(",")
    .map((phrase) => phrase.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
  const platforms = (get("platforms") ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is Platform => ["tiktok", "instagram", "youtube"].includes(name))
    .sort();
  return {
    query: query || DEFAULTS.query,
    platforms: platforms.length ? platforms : [...DEFAULTS.platforms].sort(),
    minFollowers: number("minFollowers", DEFAULTS.minFollowers, 0, 1e9),
    maxFollowers: number("maxFollowers", DEFAULTS.maxFollowers, 0, 1e9),
    days: number("days", DEFAULTS.days, 1, 90),
    limit: number("limit", DEFAULTS.limit, 1, 100),
  };
}

export function readMode(params: URLSearchParams, body: Record<string, unknown>): Mode {
  const flag = (name: string) => ["1", "true"].includes(String(params.get(name) ?? body[name]));
  return flag("refresh") ? "refresh" : flag("reanalyze") ? "reanalyze" : "default";
}

/** Same search, same file name: "saving-money_instagram+tiktok_f5000-200000_30d_n20". */
export function slugOf(search: NicheSearch): string {
  const words = search.query.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return [
    words,
    search.platforms.join("+"),
    `f${search.minFollowers}-${search.maxFollowers}`,
    `${search.days}d`,
    `n${search.limit}`,
  ].join("_");
}

// ---------------------------------------------------------------------------
// Running a search

async function run(
  search: NicheSearch,
  slug: string,
  mode: Mode,
  onProgress: (progress: Progress) => void,
): Promise<{ signal: SavedSignal; source: Source; slug?: string }> {
  if (DEMO_MODE) return closestSaved(search, slug);
  if (mode === "default") {
    const saved = await load<SavedSignal>(SIGNAL_DIR, slug);
    if (saved) return { signal: saved, source: "saved" };
  }

  let oriane = mode === "refresh" ? null : await load<SavedOriane>(ORIANE_DIR, slug);
  if (mode === "reanalyze" && !oriane) {
    throw new NotSaved(`No saved Oriane results for "${slug}". Use ?refresh=1 to fetch them.`);
  }
  const fetched = !oriane;
  if (!oriane) {
    onProgress({ stage: "searching", detail: `Searching Oriane for "${search.query}"` });
    const query = nicheQuery(search);
    const found = await searchContents(query, { limit: search.limit });
    oriane = {
      search,
      fetchedAt: new Date().toISOString(),
      totalCount: found.pagination.totalCount,
      oriane: query,
      results: found.results,
    };
    await save(ORIANE_DIR, slug, oriane);
  }
  onProgress({
    stage: "filtering",
    detail: `Top ${oriane.results.length} of ${oriane.totalCount.toLocaleString("en")} organic videos from ${thousands(search.minFollowers)}–${thousands(search.maxFollowers)} follower creators${fetched ? "" : " (saved results)"}`,
  });

  const analysis = await analyze(oriane.results, search.query, onProgress);
  const source: Source =
    mode === "refresh" ? "refreshed" : mode === "reanalyze" ? "reanalyzed" : fetched ? "live" : "from-saved-oriane";
  const signal: SavedSignal = {
    search,
    generatedAt: new Date().toISOString(),
    model: SIGNAL_MODEL,
    orianeFile: `data/oriane/${slug}.json`,
    videosAnalysed: Math.min(oriane.results.length, MAX_VIDEOS),
    totalMatches: oriane.totalCount,
    ...analysis,
  };
  await save(SIGNAL_DIR, slug, signal);
  return { signal, source };
}

/** Demo mode never searches Oriane: a niche nobody saved gets the saved search sharing the most words with it. */
async function closestSaved(search: NicheSearch, slug: string): Promise<{ signal: SavedSignal; source: Source; slug: string }> {
  const exact = await load<SavedSignal>(SIGNAL_DIR, slug);
  if (exact) return { signal: exact, source: "saved", slug };

  const words = new Set(search.query.split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  const shared = (query: string) => query.split(/[^a-z0-9]+/).filter((word) => words.has(word)).length;
  // Our own account's results are not a niche search, so a typed niche never lands on them.
  const candidates = (await listSaved()).filter((saved) => !saved.search.query.startsWith("our "));
  const best =
    [...candidates].sort((a, b) => shared(b.search.query) - shared(a.search.query))[0] ?? null;
  // readSearch sorts the platforms, so the saved file names have them sorted too.
  const fallback = slugOf({ ...DEFAULTS, platforms: [...DEFAULTS.platforms].sort() });
  const chosen = best && shared(best.search.query) > 0 ? best.slug : fallback;
  const signal = await load<SavedSignal>(SIGNAL_DIR, chosen);
  if (!signal) throw new NotSaved(`No saved search "${chosen}" for the demo`);
  return { signal, source: "saved", slug: chosen };
}

async function summarize(slug: string, signal: SavedSignal): Promise<SignalSummary> {
  let { videosAnalysed, totalMatches } = signal;
  if (videosAnalysed == null) {
    const oriane = await load<SavedOriane>(ORIANE_DIR, slug);
    videosAnalysed = oriane
      ? Math.min(oriane.results.length, MAX_VIDEOS)
      : signal.briefs.reduce((sum, brief) => sum + brief.evidence.length, 0) + signal.rejected.length;
    totalMatches = oriane?.totalCount;
  }
  return {
    slug,
    search: signal.search,
    briefs: signal.briefs,
    videosAnalysed,
    rejectedCount: signal.rejected.length,
    totalMatches: totalMatches ?? null,
    generatedAt: signal.generatedAt,
  };
}

export async function listSaved(): Promise<SavedSearch[]> {
  const files = await readdir(SIGNAL_DIR).catch(() => [] as string[]);
  const saved: SavedSearch[] = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const slug = file.slice(0, -".json".length);
    const signal = await load<SavedSignal>(SIGNAL_DIR, slug);
    if (signal?.briefs?.length) {
      saved.push({ slug, search: signal.search, formats: signal.briefs.length, generatedAt: signal.generatedAt });
    }
  }
  return saved.sort((a, b) => a.search.query.localeCompare(b.search.query));
}

// ---------------------------------------------------------------------------
// Jobs: one run per search at a time, with its stage readable while it runs.

interface Job {
  id: string;
  key: string;
  slug: string;
  search: NicheSearch;
  status: "running" | "done" | "error";
  progress: Progress;
  /** The last detail of each stage, so finished stages keep saying what they found. */
  notes: Partial<Record<Progress["stage"], string>>;
  startedAt: number;
  stageStartedAt: number;
  source?: Source;
  summary?: SignalSummary;
  error?: string;
  errorStatus?: number;
  done: Promise<SignalSummary>;
}

/** What GET /api/signal/scan returns. */
export interface JobView extends Progress {
  jobId: string;
  slug: string;
  search: NicheSearch;
  status: Job["status"];
  elapsedMs: number;
  stageElapsedMs: number;
  notes: Partial<Record<Progress["stage"], string>>;
  source?: string;
  result?: SignalSummary;
  error?: string;
}

// Kept on globalThis: each route is bundled separately, and dev reloads modules,
// but both must see the same jobs.
const registry = globalThis as typeof globalThis & { __signalJobs?: Map<string, Job> };
const jobs = (registry.__signalJobs ??= new Map<string, Job>());

export function startJob(search: NicheSearch, mode: Mode): Job {
  const slug = slugOf(search);
  const key = `${mode}:${slug}`;
  // React runs effects twice in dev and people double-click: share the run, pay once.
  for (const job of jobs.values()) if (job.key === key && job.status === "running") return job;
  for (const [id, job] of jobs) if (job.status !== "running" && Date.now() - job.startedAt > 30 * 60_000) jobs.delete(id);

  const now = Date.now();
  const job = {
    id: crypto.randomUUID(),
    key,
    slug,
    search,
    status: "running",
    progress: { stage: "searching", detail: "Starting" },
    notes: {},
    startedAt: now,
    stageStartedAt: now,
  } as Job;

  job.done = run(search, slug, mode, (progress) => {
    if (progress.stage !== job.progress.stage) job.stageStartedAt = Date.now();
    job.progress = progress;
    job.notes[progress.stage] =
      progress.stage === "frames" ? `${progress.framesDone}/${progress.framesTotal} opening frames read` : progress.detail;
  })
    .then(async ({ signal, source, slug: used }) => {
      if (used) job.slug = used;
      job.summary = await summarize(job.slug, signal);
      job.source = source;
      job.status = "done";
      job.progress = { stage: "done", detail: source === "saved" ? "Loaded saved formats" : "Saved for next time" };
      return job.summary;
    })
    .catch((error) => {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
      job.errorStatus = error instanceof NotSaved ? 404 : 502;
      console.error(`signal ${slug}:`, error);
      throw error;
    });
  // The studio polls rather than awaiting, so a failure must not go unhandled.
  job.done.catch(() => {});

  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function viewOf(job: Job): JobView {
  const now = Date.now();
  return {
    jobId: job.id,
    slug: job.slug,
    search: job.search,
    status: job.status,
    ...job.progress,
    elapsedMs: now - job.startedAt,
    stageElapsedMs: now - job.stageStartedAt,
    notes: job.notes,
    source: job.source,
    result: job.summary,
    error: job.error,
  };
}

// ---------------------------------------------------------------------------

function thousands(count: number): string {
  return count >= 1000 ? `${Math.round(count / 1000)}k` : String(count);
}

async function load<T>(dir: string, slug: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, `${slug}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

async function save(dir: string, slug: string, data: unknown) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.json`), JSON.stringify(data, null, 2) + "\n");
}
