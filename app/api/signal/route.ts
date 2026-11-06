// POST or GET /api/signal: the formats working right now, as FormatBrief[].
//
// Two saved layers, both committed so the demo and the other laptop never wait:
//   data/oriane/<slug>.json   raw Oriane results for a search
//   data/signal/<slug>.json   the formats the LLM made from them
// Default: return the saved formats. New searches fetch live and save both.
//   ?refresh=1    fetch Oriane again, then re-run the LLM
//   ?reanalyze=1  re-run the LLM on the saved Oriane results only
//
// Search params (query string or JSON body), all optional:
//   q            words to find, commas for alternatives   default "saving money"
//   platforms    tiktok,instagram                         default both
//   minFollowers, maxFollowers                            default 5000, 200000
//   days         published in the last N days             default 30
//   limit        videos to fetch, 1 to 100                default 20
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Platform } from "@/lib/contract";
import { nicheQuery, searchContents, type NicheSearch, type OrianeContent } from "@/lib/oriane";
import { analyze, SIGNAL_MODEL, type Analysis } from "./analyze";

const DEFAULTS: NicheSearch = {
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
}

type Source = "saved" | "live" | "refreshed" | "reanalyzed" | "from-saved-oriane";

// React runs the page's effect twice in dev, so the same search can arrive twice
// at once. Share one run instead of paying Oriane and GMI twice.
const running = new Map<string, Promise<{ signal: SavedSignal; source: Source }>>();

export async function GET(request: Request) {
  return handle(request, {});
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return handle(request, body && typeof body === "object" ? body : {});
}

async function handle(request: Request, body: Record<string, unknown>) {
  const url = new URL(request.url);
  const flag = (name: string) => ["1", "true"].includes(String(url.searchParams.get(name) ?? body[name]));
  const search = readSearch(url.searchParams, body);
  const slug = slugOf(search);
  const mode = flag("refresh") ? "refresh" : flag("reanalyze") ? "reanalyze" : "default";
  const key = `${mode}:${slug}`;

  try {
    let job = running.get(key);
    if (!job) {
      job = run(search, slug, mode).finally(() => running.delete(key));
      running.set(key, job);
    }
    const { signal, source } = await job;
    return Response.json(signal.briefs, {
      headers: { "x-signal-source": source, "x-signal-slug": slug },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`signal ${slug}:`, error);
    const status = error instanceof NotSaved ? 404 : 502;
    return Response.json({ error: message, slug }, { status, headers: { "x-signal-slug": slug } });
  }
}

class NotSaved extends Error {}

async function run(
  search: NicheSearch,
  slug: string,
  mode: "default" | "refresh" | "reanalyze",
): Promise<{ signal: SavedSignal; source: Source }> {
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

  const analysis = await analyze(oriane.results, search.query);
  const source: Source =
    mode === "refresh" ? "refreshed" : mode === "reanalyze" ? "reanalyzed" : fetched ? "live" : "from-saved-oriane";
  const signal: SavedSignal = {
    search,
    generatedAt: new Date().toISOString(),
    model: SIGNAL_MODEL,
    orianeFile: `data/oriane/${slug}.json`,
    ...analysis,
  };
  await save(SIGNAL_DIR, slug, signal);
  return { signal, source };
}

function readSearch(params: URLSearchParams, body: Record<string, unknown>): NicheSearch {
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

/** Same search, same file name: "saving-money_instagram+tiktok_f5000-200000_30d_n20". */
function slugOf(search: NicheSearch): string {
  const words = search.query.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return [
    words,
    search.platforms.join("+"),
    `f${search.minFollowers}-${search.maxFollowers}`,
    `${search.days}d`,
    `n${search.limit}`,
  ].join("_");
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
