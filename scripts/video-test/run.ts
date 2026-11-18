// GMI video test: one format brief in, one 8-second vertical UGC clip out, to judge quality
// before the create pipeline is ready.
//
//   node --env-file=.env.local scripts/video-test/run.ts <signalFile> <formatId|top> <model> [flags]
//
// model:  veo        Veo 3.1 Fast, 1080p, audio            ~$0.15/s
//         kling      Kling v3 Omni, pro, sound, 9:16       ~$0.168/s
//         kling-t2v  Kling v3 text-to-video: has NO aspect ratio option, so not vertical
//         seedance   Seedance 2.0 Fast, 720p, audio        ~$0.12/s
// flags:  --dry-run      print the prompt and payloads, submit nothing
//         --no-fallback  do not move on to the next model (veo > kling > seedance) when one is
//                        inactive or rate-limited
//         --resume <id>  poll a request that was already submitted instead of paying again
//         --force        render again even if the output exists
//
// The scene and spoken line for each format live in scripts/video-test/prompts/<formatId>.json.
// Output: public/out/test-<model>-<formatId>.mp4, plus a .json record written the moment the job
// is submitted, so a crash mid-poll resumes the paid job on the next run instead of paying twice.

import type { FormatBrief } from "../../lib/contract";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QUEUE = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../public/out");
const SECONDS = 8;
const POLL_MS = 5000;
const TIMEOUT_MS = 15 * 60_000;
const VEO_PROMPT_MAX = 2000;

interface Scene {
  creator: string;
  setting: string;
  lighting: string;
  beats: { action: string; says: string }[];
}

/** A multi-shot storyboard: prompts/<formatId>.multi.json. scripts/video-test/edit.ts reads it too. */
export interface Story {
  /** Reuse the creator from an earlier render: "veo" reads public/out/test-veo-<formatId>.json. */
  creatorFrom?: string;
  /** Kling element name (max 20 chars) and description (max 100). */
  creatorName?: string;
  creatorDescription?: string;
  shots: {
    seconds: number;
    kind: "aroll" | "broll";
    /** {says} is replaced with the quoted spoken line. */
    prompt: string;
    says?: string;
    caption?: string;
    captionAt?: "top" | "bottom";
    zoom?: "push" | "punch";
    look?: "vhs" | "glow";
  }[];
  endCard?: { seconds: number; lines: string[] };
}

interface Built {
  /** The single prompt, or every shot prompt joined, for the record. */
  prompt: string;
  negative: string;
  /** Everything spoken, for the brand check. */
  line: string;
  seconds: number;
  shots?: { index: number; prompt: string; duration: string }[];
  element?: Record<string, unknown>;
}

interface ModelSpec {
  id: string;
  label: string;
  /** Estimate only, read from GET /models/{id} on 2026-11-06 for this payload. */
  usdPerSecond: number;
  /** Takes a storyboard (prompts/<formatId>.multi.json) instead of a single scene. */
  multi?: boolean;
  payload: (built: Built) => Record<string, unknown>;
}

interface JobState {
  request_id?: string;
  status?: string;
  outcome?: { video_url?: string; media_urls?: { url: string }[]; [key: string]: unknown };
  created_at?: number;
  updated_at?: number;
  queued_at?: number;
  [key: string]: unknown;
}

interface JobRecord {
  formatId: string;
  model: string;
  signalFile: string;
  requestId: string;
  submittedAt: string;
  prompt: string;
  payload: Record<string, unknown>;
  status?: string;
  finishedAt?: string;
  renderSeconds?: number;
  costFields?: Record<string, unknown>;
  estimatedUsd?: number;
  file?: string;
  final?: JobState;
}

const MODELS: Record<string, ModelSpec> = {
  veo: {
    id: "veo-3.1-fast-generate-001",
    label: "Veo 3.1 Fast",
    usdPerSecond: 0.15, // 720p and 1080p cost the same with audio on
    payload: (b) => ({
      prompt: b.prompt,
      negativePrompt: b.negative,
      durationSeconds: b.seconds,
      aspectRatio: "9:16",
      resolution: "1080p",
      generateAudio: true,
      personGeneration: "allow_adult",
    }),
  },
  kling: {
    // kling-v3-text-to-video takes no aspect ratio. The Omni variant of v3 takes 9:16.
    id: "kling-v3-omni",
    label: "Kling v3 Omni",
    usdPerSecond: 0.168, // top of the listed $0.084 to $0.168 range: pro, sound on
    payload: (b) => ({
      prompt: b.prompt,
      duration: String(b.seconds),
      aspect_ratio: "9:16",
      sound: "on",
      mode: "pro",
    }),
  },
  "kling-multi": {
    // Up to 6 shots and 15 s in one call. The creator element is built from an earlier render,
    // so every shot has the same face and, when that render has speech, the same voice.
    id: "kling-v3-omni",
    label: "Kling v3 Omni multi-shot",
    usdPerSecond: 0.14, // pro, sound on, no video_list; element creation may add to it
    multi: true,
    payload: (b) => ({
      multi_shot: true,
      shot_type: "customize",
      multi_prompt: b.shots,
      duration: String(b.seconds),
      aspect_ratio: "9:16",
      sound: "on",
      mode: "pro",
      ...(b.element ? { element_list: [b.element] } : {}),
    }),
  },
  "kling-t2v": {
    id: "kling-v3-text-to-video",
    label: "Kling v3 text-to-video (no 9:16 option)",
    usdPerSecond: 0.252, // listed rate with audio on
    payload: (b) => ({
      prompt: b.prompt,
      negative_prompt: b.negative,
      duration: String(b.seconds),
      sound: "on",
      mode: "pro",
    }),
  },
  seedance: {
    id: "seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    usdPerSecond: 0.12, // listed 720p rate
    payload: (b) => ({
      prompt: b.prompt,
      duration: b.seconds,
      ratio: "9:16",
      resolution: "720p",
      generate_audio: true,
      watermark: false,
    }),
  },
};
const FALLBACK = ["veo", "kling", "seedance"];

const NEGATIVE =
  "cinematic look, film grain, color grading, studio lighting, professional camera, gimbal or tripod stabilization, smooth dolly moves, shallow depth of field bokeh, background music, subtitles, captions, on-screen text, logos, watermark, beauty filter, plastic skin, distorted hands, extra fingers, warped face, out-of-sync lips";

// brand/lodavo.md "Never say", plus "an AI-generated person never plays a user or a winner".
const NEVER_SAY: [RegExp, string][] = [
  [/\bbank\b(?! account)/i, '"bank" for Lodavo (say "savings app")'],
  [/\b(safe|can'?t lose|risk-free|insured|guaranteed?)\b/i, "a safety claim"],
  [/18\+/, '"18+" (say "age of majority")'],
  [/\b(gambling|betting|bets?|wager|lottery)\b/i, "gambling words"],
  [/\bwin prizes\b/i, '"win prizes" (say "chance to win")'],
  [/\bpick\b/i, '"pick" (say "choose")'],
  [/\bentr(y|ies)\b/i, '"entries" (say "tickets")'],
  [/&/, '"&" (write "and")'],
  [/\binto Lodavo\b/i, 'money "into Lodavo"'],
  [/\bLodavo (sees|watches|knows|tracks)\b/i, "Lodavo watching your savings"],
  [/\b(compound(s|ing)?|returns?|interest|at risk)\b/i, "returns or interest"],
  [/\ba (real|free) shot\b/i, '"a shot" (say "a chance")'],
  [/\bmembers?\b/i, '"members" (say "users")'],
  [/—/, "an em dash"],
  [/\b(I use|I'm using|I've been using|my tickets|I won|I've won|I just won)\b/i, "the AI creator playing a Lodavo user"],
];
const NEEDS_LEGAL_LINE = /\b(win|wins|won|winning|winner|prizes?|jackpot)\b/i;

function checkCopy(line: string, maxWords = 19): string[] {
  const problems = NEVER_SAY.filter(([pattern]) => pattern.test(line)).map(([, why]) => why);
  const words = line.split(/\s+/).filter(Boolean).length;
  if (words > maxWords) problems.push(`${words} words, must be under ${maxWords + 1}`);
  return problems;
}

/** Every spoken line, caption and end-card line, plus whether each line can be said in its shot. */
function storyCopy(story: Story): string[] {
  return [...story.shots.flatMap((s) => [s.says, s.caption]), ...(story.endCard?.lines ?? [])].filter(
    (text): text is string => Boolean(text),
  );
}

function checkStory(story: Story): string[] {
  const problems = storyCopy(story).flatMap((text) => checkCopy(text, Infinity).map((why) => `"${text}": ${why}`));
  story.shots.forEach((shot, i) => {
    const words = shot.says?.split(/\s+/).filter(Boolean).length ?? 0;
    if (words / shot.seconds > 3) problems.push(`shot ${i + 1} has ${words} words in ${shot.seconds} s, too fast to say`);
  });
  return problems;
}

function buildStory(story: Story, formatId: string): Built {
  if (story.shots.length > 6) throw new Error("Kling takes at most 6 shots.");
  const seconds = story.shots.reduce((sum, shot) => sum + shot.seconds, 0);
  if (seconds < 3 || seconds > 15) throw new Error(`Shots add up to ${seconds} s. Kling takes 3 to 15.`);
  const shots = story.shots.map((shot, i) => {
    const quoted = shot.says ? `"${shot.says}"` : "";
    const prompt = shot.prompt.includes("{says}")
      ? shot.prompt.replace("{says}", quoted)
      : shot.says
        ? `${shot.prompt} Says: ${quoted}`
        : shot.prompt;
    if (prompt.length > 512) throw new Error(`Shot ${i + 1} prompt is ${prompt.length} chars. Kling takes 512.`);
    return { index: i + 1, prompt, duration: String(shot.seconds) };
  });

  let element: Record<string, unknown> | undefined;
  if (story.creatorFrom) {
    const recordPath = resolve(OUT_DIR, `test-${story.creatorFrom}-${formatId}.json`);
    const record = existsSync(recordPath) ? (JSON.parse(readFileSync(recordPath, "utf8")) as JobRecord) : undefined;
    const url = record?.final?.outcome?.video_url;
    if (!url) {
      throw new Error(`No ${story.creatorFrom} render to take the creator from (${rel(recordPath)}). Render it first, or drop creatorFrom.`);
    }
    element = {
      refer_videos: [url],
      element_name: (story.creatorName ?? "Creator").slice(0, 20),
      element_description: (story.creatorDescription ?? "The creator").slice(0, 100),
    };
  }

  return {
    prompt: shots.map((s) => `[shot ${s.index}, ${s.duration} s] ${s.prompt}`).join("\n\n"),
    negative: "",
    line: story.shots.flatMap((s) => (s.says ? [s.says] : [])).join(" "),
    seconds,
    shots,
    element,
  };
}

function buildPrompt(brief: FormatBrief, scene: Scene): Built {
  if (scene.beats.length < 2) throw new Error("The scene needs two beats, one per format beat.");
  const beats = scene.beats.slice(0, 2).map((beat, i) => {
    const from = brief.beats[i]?.fromSeconds ?? i * 4;
    const to = Math.min(brief.beats[i]?.toSeconds ?? (i + 1) * 4, SECONDS);
    return `${from} to ${to} seconds: ${beat.action} The creator says: "${beat.says}"`;
  });
  const prompt = [
    `Raw vertical 9:16 selfie video shot on an iPhone front camera, ${SECONDS} seconds, one continuous take. Amateur UGC TikTok style, not cinematic: no color grading, no film look, no stabilizer, no studio lighting.`,
    `Creator: ${scene.creator}`,
    `Setting: ${scene.setting}`,
    `Lighting: ${scene.lighting}`,
    "Camera: held at arm's length just below eye level, arm partly visible at the frame edge. Constant small handheld shake and micro-corrections, slight front-camera wide-angle distortion, auto-exposure and focus adjusting naturally.",
    ...beats,
    "Speech: casual and a little fast, like telling a friend. Only those two sentences, word for word.",
    "Audio: only the creator's voice, close and clear on the clip-on mic, natural room tone with a slight echo. No music, no sound effects. No subtitles, no captions, no on-screen text, no logos, no watermark.",
  ].join("\n\n");
  const line = scene.beats.slice(0, 2).map((beat) => beat.says).join(" ");
  return { prompt, negative: NEGATIVE, line, seconds: SECONDS };
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = { dryRun: false, noFallback: false, force: false, resume: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--no-fallback") flags.noFallback = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--resume") flags.resume = argv[++i];
    else positional.push(arg);
  }
  return { positional, flags };
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const rel = (path: string) => relative(process.cwd(), path).replaceAll("\\", "/");
const save = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2));

function headers(): Record<string, string> {
  const key = process.env.GMI_API_KEY;
  if (!key) throw new Error("GMI_API_KEY is missing. Run with node --env-file=.env.local");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Rate limits, outages and overload: worth trying the next model. Content refusals are not. */
function isRetryable(httpStatus: number, body: unknown): boolean {
  if (httpStatus === 429 || httpStatus >= 500) return true;
  return /rate.?limit|quota|capacity|unavailable|busy|resource.?exhausted|overload|too many requests|inactive/i.test(
    JSON.stringify(body ?? ""),
  );
}

async function modelStatus(id: string): Promise<string> {
  const res = await fetch(`${QUEUE}/models/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) return `unreachable (HTTP ${res.status})`;
  const info = (await res.json()) as { status?: string };
  return info.status ?? "unknown";
}

async function poll(requestId: string, label: string, startedAt: number): Promise<JobState> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${QUEUE}/requests/${requestId}`, { headers: headers() });
    const state = (await res.json().catch(() => ({}))) as JobState;
    if (!res.ok) {
      if (res.status !== 429 && res.status < 500) throw new Error(`Poll HTTP ${res.status}: ${JSON.stringify(state)}`);
      console.log(`[${label}] ${clock(Date.now() - startedAt)} poll got HTTP ${res.status}, retrying`);
    } else {
      console.log(`[${label}] ${clock(Date.now() - startedAt)} ${state.status}`);
      if (["success", "finished", "failed", "cancelled"].includes(state.status ?? "")) return state;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Still running after ${TIMEOUT_MS / 60_000} min. Run again to resume, or pass --resume ${requestId}`);
}

/** Any field that looks like a charge, anywhere in the response except the echoed payload. */
function findCostFields(value: unknown, path = "", found: Record<string, unknown> = {}) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === "payload") continue;
    const here = path ? `${path}.${key}` : key;
    if (/cost|price|charge|bill|credit|amount|usage|fee/i.test(key) && (typeof child !== "object" || child === null)) {
      found[here] = child;
    } else findCostFields(child, here, found);
  }
  return found;
}

function probe(file: string): string {
  const run = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (run.status !== 0) return "";
  const info = JSON.parse(run.stdout) as {
    streams: { codec_type: string; width?: number; height?: number }[];
    format: { duration?: string };
  };
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.some((s) => s.codec_type === "audio");
  return `${video?.width}x${video?.height}, ${Number(info.format.duration).toFixed(1)} s, ${audio ? "with" : "NO"} audio track`;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [signalFile, formatArg, modelArg = "veo"] = positional;
  if (!signalFile || !formatArg) {
    console.log("Usage: node --env-file=.env.local scripts/video-test/run.ts <signalFile> <formatId|top> <model> [--dry-run] [--no-fallback] [--resume <id>] [--force]");
    console.log(`Models: ${Object.keys(MODELS).join(", ")}`);
    process.exit(1);
  }
  if (!MODELS[modelArg]) throw new Error(`Unknown model "${modelArg}". Use one of: ${Object.keys(MODELS).join(", ")}`);

  const signal = JSON.parse(readFileSync(resolve(signalFile), "utf8")) as { briefs: FormatBrief[] };
  const brief =
    formatArg === "top"
      ? [...signal.briefs].sort((a, b) => b.score - a.score)[0]
      : signal.briefs.find((b) => b.id === formatArg);
  if (!brief) {
    throw new Error(`No format "${formatArg}". Formats: ${signal.briefs.map((b) => `${b.id} (${b.score})`).join(", ")}`);
  }
  const multi = MODELS[modelArg].multi === true;
  const scenePath = resolve(HERE, "prompts", `${brief.id}${multi ? ".multi" : ""}.json`);
  if (!existsSync(scenePath)) {
    throw new Error(`Write the ${multi ? "storyboard" : "scene"} for this format first: ${rel(scenePath)}`);
  }
  const sceneJson: unknown = JSON.parse(readFileSync(scenePath, "utf8"));
  const built = multi ? buildStory(sceneJson as Story, brief.id) : buildPrompt(brief, sceneJson as Scene);

  console.log(`Format: ${brief.name} (${brief.id}), score ${brief.score}`);
  console.log(`Hook pattern: ${brief.hookPattern}`);
  for (const beat of brief.beats.slice(0, multi ? undefined : 2)) {
    console.log(`  brief ${beat.fromSeconds}-${beat.toSeconds}s says: ${beat.says}`);
  }
  console.log(`\n--- prompt (${built.prompt.length} chars) ---\n${built.prompt}\n`);
  if (!multi) console.log(`--- negative (${built.negative.length} chars) ---\n${built.negative}\n`);
  if (built.element) console.log(`Creator element built from: ${String((built.element.refer_videos as string[])[0])}`);
  console.log(`Spoken, ${built.line.split(/\s+/).length} words in ${built.seconds} s: "${built.line}"`);

  const problems = multi ? checkStory(sceneJson as Story) : checkCopy(built.line);
  if (problems.length) throw new Error(`Copy breaks brand/lodavo.md: ${problems.join("; ")}`);
  const copy = multi ? storyCopy(sceneJson as Story).join(" ") : built.line;
  if (NEEDS_LEGAL_LINE.test(copy)) {
    console.log(
      multi
        ? "Note: the copy mentions winning or prizes. edit.ts burns the legal line into the last 3 s."
        : "Note: the line mentions winning or prizes, so the legal line must be overlaid on the last 3 s in post.",
    );
  }
  if (!multi && built.prompt.length > VEO_PROMPT_MAX) console.log(`Warning: prompt is over Veo's ${VEO_PROMPT_MAX}-char limit.`);

  const chain = flags.noFallback || !FALLBACK.includes(modelArg) ? [modelArg] : FALLBACK.slice(FALLBACK.indexOf(modelArg));
  if (flags.dryRun) {
    for (const alias of chain) {
      const spec = MODELS[alias];
      const cost = (spec.usdPerSecond * built.seconds).toFixed(2);
      const payload = spec.payload(built);
      console.log(`\n${spec.label} (${spec.id}), estimate $${cost}:`);
      console.log(
        JSON.stringify(spec.multi ? { ...payload, multi_prompt: "<shots above>" } : { ...payload, prompt: "<above>" }, null, 2),
      );
    }
    console.log("\nDry run: nothing submitted.");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const alias of chain) {
    const spec = MODELS[alias];
    const base = resolve(OUT_DIR, `test-${alias}-${brief.id}`);
    const mp4 = `${base}.mp4`;
    const recordPath = `${base}.json`;
    if (existsSync(mp4) && !flags.force) {
      console.log(`Already rendered: ${rel(mp4)}. Pass --force to pay for another one.`);
      return;
    }

    // Resume a paid job that never got downloaded, rather than submitting a second one.
    let record = existsSync(recordPath) ? (JSON.parse(readFileSync(recordPath, "utf8")) as JobRecord) : undefined;
    let requestId = alias === chain[0] ? flags.resume : undefined;
    if (!requestId && record && !flags.force && !["failed", "cancelled"].includes(record.status ?? "")) {
      requestId = record.requestId;
      console.log(`Resuming ${spec.label} request ${requestId} from ${rel(recordPath)}`);
    }

    if (!requestId) {
      const status = await modelStatus(spec.id);
      if (status !== "active") {
        console.log(`${spec.label} is ${status}. Trying the next model.`);
        continue;
      }
      const payload = spec.payload(built);
      const res = await fetch(`${QUEUE}/requests`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ model: spec.id, payload }),
      });
      const body = (await res.json().catch(() => ({}))) as JobState;
      if (!res.ok || !body.request_id) {
        const why = `${spec.label} refused the job: HTTP ${res.status} ${JSON.stringify(body)}`;
        if (isRetryable(res.status, body) && alias !== chain.at(-1)) {
          console.log(`${why}\nTrying the next model.`);
          continue;
        }
        throw new Error(why);
      }
      requestId = body.request_id;
      record = {
        formatId: brief.id,
        model: spec.id,
        signalFile,
        requestId,
        submittedAt: new Date().toISOString(),
        prompt: built.prompt,
        payload,
        status: body.status,
      };
      save(recordPath, record);
      console.log(`Submitted to ${spec.label} (${spec.id}): request ${requestId}`);
    }

    const startedAt = record?.submittedAt ? Date.parse(record.submittedAt) : Date.now();
    const state = await poll(requestId, alias, startedAt);
    const renderSeconds = Math.round((Date.now() - startedAt) / 1000);
    const costFields = findCostFields(state);
    const estimatedUsd = Number((spec.usdPerSecond * built.seconds).toFixed(2));
    record = {
      ...(record ?? { formatId: brief.id, model: spec.id, signalFile, requestId, submittedAt: new Date(startedAt).toISOString(), prompt: built.prompt, payload: spec.payload(built) }),
      status: state.status,
      finishedAt: new Date().toISOString(),
      renderSeconds,
      costFields,
      estimatedUsd,
      final: state,
    };
    save(recordPath, record);

    if (state.status === "failed" || state.status === "cancelled") {
      const why = `${spec.label} job ${state.status}: ${JSON.stringify(state.outcome ?? state)}`;
      if (isRetryable(200, state) && alias !== chain.at(-1)) {
        console.log(`${why}\nTrying the next model.`);
        continue;
      }
      throw new Error(why);
    }

    const urls = [state.outcome?.video_url, ...(state.outcome?.media_urls ?? []).map((m) => m.url)].filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
    if (!urls.length) throw new Error(`Finished with no video URL. Outcome: ${JSON.stringify(state.outcome)}`);
    const video = await fetch(urls[0]);
    if (!video.ok) throw new Error(`Download HTTP ${video.status} from ${urls[0]}`);
    writeFileSync(mp4, Buffer.from(await video.arrayBuffer()));
    record.file = rel(mp4);
    save(recordPath, record);

    const serverSeconds =
      state.created_at && state.updated_at ? ` (GMI timestamps: ${state.updated_at - state.created_at} s)` : "";
    const cost = Object.keys(costFields).length
      ? `${JSON.stringify(costFields)} from GMI; listed rate gives $${estimatedUsd}`
      : `not in the response; listed rate gives $${estimatedUsd} (${built.seconds} s x $${spec.usdPerSecond})`;
    const megabytes = (statSync(mp4).size / 1e6).toFixed(1);
    console.log(`\nDone.
  model:       ${spec.label} (${spec.id})
  request:     ${requestId}
  render time: ${clock(renderSeconds * 1000)} from submit to done${serverSeconds}
  cost:        ${cost}
  file:        ${rel(mp4)} (${megabytes} MB${probe(mp4) ? `, ${probe(mp4)}` : ""})
  record:      ${rel(recordPath)}`);
    return;
  }
  throw new Error("No model took the job.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
