// Real video generation for the studio, until Ben's /api/generate is ready.
//   format + brand rules -> 8 s script (Gemini) -> Veo 3.1 Fast clip with sound (GMI)
//   -> the brand's legal line burned in with ffmpeg -> public/renders/<id>.mp4 (git-ignored)
// Each video costs about $1.20 of GMI credit (8 s at $0.15 a second, list price).
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ask } from "@/app/api/signal/analyze";
import type { Beat, FormatBrief } from "@/lib/contract";
import type { BrandProfile, Guardrails } from "../brand-profile";

const QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";
export const VIDEO_MODEL = "veo-3.1-fast-generate-001";
const SECONDS = 8;
const PRICE_PER_SECOND = 0.15;
const RENDERS = path.join(process.cwd(), "public", "renders");

export interface GenerateJob {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  startedAt: number;
  requestId?: string;
  result?: {
    videoUrl: string;
    caption: string;
    script: string;
    beats: Beat[];
    style: "ai-generated";
    clipsUsed: string[];
    generationCostUsd: number;
  };
  error?: string;
}

const registry = globalThis as typeof globalThis & { __studioGenerateJobs?: Map<string, GenerateJob> };
const jobs = (registry.__studioGenerateJobs ??= new Map<string, GenerateJob>());

export function getGeneration(jobId: string): GenerateJob | null {
  return jobs.get(jobId) ?? null;
}

/** Checks the inputs, then runs the job in the background. Throws on bad input. */
export async function startGeneration(input: {
  signalSlug?: string;
  formatId?: string;
  brand?: string;
  /** From the Studio's Research step; both optional. */
  brandProfile?: BrandProfile;
  guardrails?: Guardrails;
}) {
  const slug = String(input.signalSlug ?? "");
  if (!/^[a-z0-9+_-]+$/.test(slug)) throw new Error("signalSlug is missing or malformed");
  const signal = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "signal", `${slug}.json`), "utf8").catch(() => {
      throw new Error(`No saved signal "${slug}"`);
    }),
  ) as { briefs: FormatBrief[] };
  const brief = signal.briefs.find((candidate) => candidate.id === input.formatId);
  if (!brief) throw new Error(`No format "${input.formatId}" in ${slug}`);

  const brand = String(input.brand ?? "Lodavo").trim() || "Lodavo";
  const brandFile = brand.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const rules = await readFile(path.join(process.cwd(), "brand", `${brandFile}.md`), "utf8").catch(() => {
    throw new Error(`No brand rules at brand/${brandFile}.md, so no copy can be checked against them`);
  });

  const research = researchNotes(input.brandProfile, input.guardrails);
  const job: GenerateJob = { jobId: crypto.randomUUID(), status: "queued", stage: "Queued", startedAt: Date.now() };
  jobs.set(job.jobId, job);
  run(job, brief, brand, rules, research, input.guardrails?.requiredDisclaimers ?? []).catch((error) => {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    console.error(`studio generate ${job.jobId}:`, error);
  });
  return job;
}

async function run(
  job: GenerateJob,
  brief: FormatBrief,
  brand: string,
  rules: string,
  research: string,
  disclaimers: string[],
) {
  job.status = "running";
  job.stage = research ? `Writing the ${brand} script within its guardrails` : `Writing the ${brand} script`;
  const script = await writeScript(brief, brand, rules, research);
  // Caption disclaimers are added in code so they can't be forgotten. "AI-generated" is the video's label, not caption text.
  for (const line of disclaimers.filter((text) => !/ai-generated/i.test(text))) {
    if (!script.caption.toLowerCase().includes(line.toLowerCase().replace(/\.$/, ""))) {
      script.caption = `${script.caption.trim()} ${line}`.trim();
    }
  }

  job.stage = "Sending to Veo 3.1 Fast";
  const payload = {
    prompt: script.videoPrompt.slice(0, 2000),
    negativePrompt: "on-screen text, captions, subtitles, logos, watermarks, cash, banknotes, distorted hands",
    durationSeconds: String(SECONDS),
    aspectRatio: "9:16",
    generateAudio: true,
    resolution: "720p",
  };
  let remote: string;
  try {
    job.requestId = await submit(payload);
    remote = await waitForVideo(job);
  } catch (error) {
    // Veo fails with a bare "unknown reason" when its safety filter objects to the scene
    // (a prompt with banknotes failed 3 times in a row). Retry once with the plainest scene.
    console.error("studio generate: full prompt failed, trying the plain one:", error);
    job.stage = "Retrying with a simpler scene";
    const lines = script.beats.map((beat) => beat.says).filter(Boolean).join(" ");
    job.requestId = await submit({
      ...payload,
      prompt: `Vertical 9:16 selfie video, handheld phone at arm's length, natural window light. A friendly adult in a casual sweater sits in a tidy, plain living room and talks straight to the camera like a friend. They say, clearly and warmly: "${lines}" Only their voice, no music.`,
    });
    remote = await waitForVideo(job);
  }

  job.stage = "Adding the legal line";
  const videoUrl = await finish(remote, job.jobId, legalLine(rules));

  // Saved next to the video so the studio can show it again as a ready-made ad.
  await writeFile(
    path.join(RENDERS, `${job.jobId}.json`),
    JSON.stringify({ formatId: brief.id, formatName: brief.name, brand, model: VIDEO_MODEL, videoUrl, ...script }, null, 2),
  );

  job.result = {
    videoUrl,
    caption: script.caption,
    script: script.beats.map((beat) => beat.says ?? "").filter(Boolean).join("\n"),
    beats: script.beats,
    style: "ai-generated",
    clipsUsed: [],
    generationCostUsd: SECONDS * PRICE_PER_SECOND,
  };
  job.stage = "Done";
  job.status = "done";
}

/** The Research step's profile and guardrails, as a prompt section. Empty when the Studio sent none. */
function researchNotes(profile?: BrandProfile, guardrails?: Guardrails): string {
  if (!profile && !guardrails) return "";
  const facts = profile
    ? {
        oneLiner: profile.oneLiner,
        status: profile.status,
        howItWorks: profile.howItWorks,
        taglines: profile.taglines,
        proofPointsCanada: profile.proofPointsCanada,
        trust: profile.trust,
        audience: profile.audience,
        voice: profile.voice,
        primaryCTA: profile.primaryCTA,
      }
    : null;
  return `
THE COMPANY RESEARCH. Facts you may use, and guardrails you must obey.
${facts ? JSON.stringify(facts, null, 2) : ""}
Never say, or imply: ${(guardrails?.doNotSay ?? profile?.doNotSay ?? []).join("; ")}.
Proof points are Canadian: if you use one, say it is Canada. If this research and the brand rules disagree, follow whichever is stricter.
`;
}

async function writeScript(brief: FormatBrief, brand: string, rules: string, research = "") {
  const format = {
    name: brief.name,
    whyItWorks: brief.whyItWorks,
    hookPattern: brief.hookPattern,
    beats: brief.beats,
  };
  const prompt = `Write an ${SECONDS}-second vertical video ad for ${brand} that remakes a format working right now on TikTok and Instagram.

THE FORMAT
${JSON.stringify(format, null, 2)}

THE BRAND RULES. Follow every one. They override the format.
${rules}
${research}
The video is made by Veo, a text-to-video model with sound, in one continuous ${SECONDS}-second shot:
- One AI-generated creator talking to camera, selfie style, in one setting. They are a presenter, never a customer or a winner: no testimonials, no "I won", no claims about their own results.
- At most 22 spoken words in total, natural and conversational. Open with the format's hook pattern, its blanks filled for ${brand}.
- Use only facts that appear in the brand rules.
- Do not mention connecting a bank account anywhere, including the caption: it may never be a hook or a call to action.
- No text on screen in the video. The legal line is added afterwards.
- Nothing that trips the video model's safety filter: no cash, banknotes, coins, bank cards, cars, children or real brands and logos on screen. Keep it to a person talking in an ordinary room.

Return JSON only, in exactly this shape:
{"beats":[{"fromSeconds":0,"toSeconds":3,"shows":"what is on screen","says":"the words spoken","onScreen":"a short caption to show beside the video, optional"}],"caption":"the post caption, one or two short sentences that follow the brand rules","videoPrompt":"the full prompt for Veo: the person, setting, camera, lighting and mood, then the exact words they say, in quotes and in order. Under 1500 characters."}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await ask([{ role: "user", content: prompt }], 60_000);
      const parsed = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
      const beats: Beat[] = (parsed.beats ?? [])
        .filter((beat: Partial<Beat>) => beat.shows || beat.says)
        .map((beat: Partial<Beat>) => ({
          fromSeconds: Number(beat.fromSeconds) || 0,
          toSeconds: Number(beat.toSeconds) || 0,
          shows: String(beat.shows ?? ""),
          ...(beat.says ? { says: String(beat.says) } : {}),
          ...(beat.onScreen ? { onScreen: String(beat.onScreen) } : {}),
        }));
      if (!beats.length || typeof parsed.videoPrompt !== "string") throw new Error("Script JSON is missing beats or videoPrompt");
      return { beats, caption: String(parsed.caption ?? ""), videoPrompt: parsed.videoPrompt as string };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function headers() {
  const key = process.env.GMI_API_KEY;
  if (!key) throw new Error("GMI_API_KEY is missing from .env.local");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** GMI sometimes answers 500 "Generation failed for an unknown reason; please retry", so retry it. */
async function submit(payload: Record<string, unknown>): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(QUEUE_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ model: VIDEO_MODEL, payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.request_id) return json.request_id as string;
    lastError = `GMI submit ${res.status}: ${JSON.stringify(json).slice(0, 300)}`;
    console.error(`studio generate: attempt ${attempt} failed: ${lastError}`);
    if (res.status < 500 && res.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
  }
  throw new Error(lastError);
}

async function waitForVideo(job: GenerateJob): Promise<string> {
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const res = await fetch(`${QUEUE_URL}/${job.requestId}`, { headers: headers() });
    const state = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GMI poll ${res.status}: ${JSON.stringify(state).slice(0, 300)}`);
    const status = String(state.status ?? "");
    if (status === "success" || status === "finished") {
      const url = findVideoUrl(state.outcome ?? state);
      if (!url) throw new Error(`GMI finished but returned no video URL: ${JSON.stringify(state).slice(0, 300)}`);
      return url;
    }
    if (status === "failed" || status === "cancelled") {
      throw new Error(`GMI job ${status}: ${JSON.stringify(state.outcome ?? state).slice(0, 300)}`);
    }
    job.stage =
      status === "queued" || status === "dispatched"
        ? "Waiting for a GPU at GMI"
        : "Veo 3.1 Fast is rendering the video";
  }
  throw new Error("The video was still rendering after 8 minutes");
}

/** GMI's docs give the result as outcome.media_urls[].url and as outcome.video_url: take whichever is there. */
function findVideoUrl(value: unknown): string | null {
  if (typeof value === "string") return /^https?:\/\//.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["video_url", "url", "media_urls", "video", "videos"]) {
      const found = key in record ? findVideoUrl(record[key]) : null;
      if (found) return found;
    }
    for (const item of Object.values(record)) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
  }
  return null;
}

/** The English legal line from the brand file's "Legal line" section, if it has one. */
function legalLine(rules: string): string | null {
  return rules.match(/EN:\s*`([^`]+)`/)?.[1] ?? null;
}

/** Downloads the clip and burns in the legal line for the last 3 seconds. Returns its public URL. */
async function finish(remoteUrl: string, id: string, legal: string | null): Promise<string> {
  await mkdir(RENDERS, { recursive: true });
  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`Could not download the video: HTTP ${res.status}`);
  const raw = path.join(RENDERS, `${id}-raw.mp4`);
  await writeFile(raw, Buffer.from(await res.arrayBuffer()));
  if (!legal) return `/renders/${id}-raw.mp4`;

  // Two lines so it fits a 720 px wide frame. textfile avoids escaping ":" and "&".
  const split = legal.lastIndexOf(". ", Math.floor(legal.length * 0.6));
  const text = split > 0 ? `${legal.slice(0, split + 1)}\n${legal.slice(split + 2)}` : legal;
  await writeFile(path.join(RENDERS, `${id}-legal.txt`), text);
  const font = process.platform === "win32" ? "fontfile='C\\:/Windows/Fonts/arialbd.ttf':" : "";
  const filter =
    `drawtext=${font}textfile='public/renders/${id}-legal.txt':fontcolor=white:fontsize=26:line_spacing=8:` +
    `box=1:boxcolor=black@0.6:boxborderw=14:x=(w-text_w)/2:y=h-text_h-110:enable='gte(t,${SECONDS - 3})'`;
  try {
    await promisify(execFile)(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", `public/renders/${id}-raw.mp4`, "-vf", filter, "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
        `public/renders/${id}.mp4`],
      { cwd: process.cwd(), timeout: 60_000 },
    );
    return `/renders/${id}.mp4`;
  } catch (error) {
    // No ffmpeg or a filter problem: show the clip anyway, and say so in the log.
    console.error("studio generate: legal line not added:", error);
    return `/renders/${id}-raw.mp4`;
  }
}
