// Turns saved Oriane results into FormatBrief[]. The LLM sees each video's
// opening frame plus its transcript and on-screen text, drops false matches and
// groups the rest into formats. Scores come from Oriane's numbers, never the LLM.
import type { Beat, Evidence, FormatBrief } from "@/lib/contract";
import { chat, type ChatContent } from "@/lib/gmi";
import { toEvidence, type OrianeContent } from "@/lib/oriane";

/**
 * Claude Sonnet answers 429 on our GMI key, and GMI's Gemini rejects image links,
 * so frames are fetched and sent inline. Tested 2026-11-06: about 1,100 tokens a frame.
 */
export const SIGNAL_MODEL = process.env.SIGNAL_MODEL ?? "google/gemini-3.8-flash";

/** The top videos the LLM sees. Each one adds a frame of about 200 KB to the request. */
const MAX_VIDEOS = 20;

export interface Analysis {
  briefs: FormatBrief[];
  rejected: { url: string; reason: string }[];
  usedImages: boolean;
}

interface LlmFormat {
  name?: string;
  whyItWorks?: string;
  hookPattern?: string;
  beats?: Partial<Beat>[];
  durationSeconds?: number;
  videos?: number[];
}

export async function analyze(results: OrianeContent[], query: string): Promise<Analysis> {
  const contents = results.slice(0, MAX_VIDEOS);
  if (contents.length === 0) throw new Error(`Oriane found no videos for "${query}"`);
  const evidence = contents.map(toEvidence);
  const frames = await Promise.all(evidence.map((item) => inlineImage(item.frameUrls[0])));

  // First try with frames. If GMI refuses them or the JSON is bad, retry on text alone.
  let lastError: unknown;
  for (const withImages of [true, false]) {
    try {
      const reply = await chat(
        [
          { role: "system", content: "You study short-form social videos for a marketing team. Reply with JSON only." },
          { role: "user", content: buildPrompt(contents, evidence, query, withImages ? frames : []) },
        ],
        { model: SIGNAL_MODEL, maxTokens: 16000 },
      );
      return { ...toBriefs(parseJson(reply), evidence), usedImages: withImages };
    } catch (error) {
      lastError = error;
      console.error(`signal: analysis ${withImages ? "with" : "without"} frames failed:`, error);
    }
  }
  throw lastError;
}

async function inlineImage(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    // Oriane serves some frames as binary/octet-stream, which Gemini rejects.
    const header = res.headers.get("content-type") ?? "";
    const extension = url.split("?")[0].split(".").pop()?.toLowerCase();
    const type = header.startsWith("image/")
      ? header
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "png"
          ? "image/png"
          : "image/webp";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function describe(content: OrianeContent, item: Evidence, number: number): string {
  const media = content.media?.[0];
  const timed = (media?.transcriptChunks ?? [])
    .map((chunk) => `[${Math.round(chunk.startSeconds)}s] ${chunk.text}`)
    .join(" ");
  return [
    `VIDEO ${number}: ${item.platform} @${item.handle}, ${item.views} views, ${item.followers} followers (${item.viewsPerFollower}x followers), ${Math.round(item.durationSeconds)}s`,
    `Caption: ${clip(content.caption ?? "", 200)}`,
    `Transcript: ${clip(timed || media?.transcript || "(none)", 700)}`,
    `On screen: ${clip(item.onScreenText.join(" | "), 300) || "(none)"}`,
    `Audio: ${item.audioTitle ?? "(none)"}`,
    `Top comments: ${clip(item.topComments.slice(0, 3).join(" | "), 300) || "(none)"}`,
  ].join("\n");
}

function buildPrompt(
  contents: OrianeContent[],
  evidence: Evidence[],
  query: string,
  frames: (string | null)[],
): ChatContent {
  const instructions = `These are the top ${contents.length} organic TikTok and Instagram videos for the search "${query}", ranked by views relative to the account's follower count.${frames.length ? " The opening frame of each video is attached after the list, labelled with its number." : ""}

${contents.map((content, index) => describe(content, evidence[index], index + 1)).join("\n\n")}

Task:
1. Drop false matches: videos not really about "${query}", brand-account ads, and videos that look like paid reach.
2. Group the rest into 3 to 5 formats. A format is a repeatable structure (hook, beats, visual style) that a brand could remake, not a topic. Each video belongs to at most one format. Prefer formats backed by 2 or more videos.
3. For each format, write its beats as a reusable template that a text-to-video AI model could generate: what is shown, what is said, what text is on screen. Base the timings on the evidence videos. Keep it 8 to 30 seconds long.
4. hookPattern is the opening line as a fill-in-the-blank, with [blanks] for what changes.

Return exactly this JSON shape and nothing else:
{"formats":[{"name":"short name","whyItWorks":"one or two sentences that point at what the evidence videos do","hookPattern":"...","beats":[{"fromSeconds":0,"toSeconds":3,"shows":"...","says":"...","onScreen":"..."}],"durationSeconds":15,"videos":[1,4]}],"rejected":[{"video":2,"reason":"..."}]}`;

  const parts: Exclude<ChatContent, string> = [{ type: "text", text: instructions }];
  frames.forEach((frame, index) => {
    if (!frame) return;
    parts.push({ type: "text", text: `Opening frame of VIDEO ${index + 1}:` });
    parts.push({ type: "image_url", image_url: { url: frame } });
  });
  return parts;
}

function parseJson(reply: string): { formats?: LlmFormat[]; rejected?: { video?: number; reason?: string }[] } {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`No JSON in the LLM reply: ${clip(reply, 200)}`);
  return JSON.parse(reply.slice(start, end + 1));
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "format";
}

function toBriefs(
  parsed: ReturnType<typeof parseJson>,
  evidence: Evidence[],
): Omit<Analysis, "usedImages"> {
  const ids = new Set<string>();
  const briefs: FormatBrief[] = [];

  for (const format of parsed.formats ?? []) {
    const proof = (format.videos ?? []).map((number) => evidence[number - 1]).filter(Boolean);
    const beats: Beat[] = (format.beats ?? [])
      .filter((beat) => beat.shows)
      .map((beat) => ({
        fromSeconds: Number(beat.fromSeconds) || 0,
        toSeconds: Number(beat.toSeconds) || 0,
        shows: String(beat.shows),
        ...(beat.says ? { says: String(beat.says) } : {}),
        ...(beat.onScreen ? { onScreen: String(beat.onScreen) } : {}),
      }));
    if (!format.name || proof.length === 0 || beats.length === 0) continue;

    let id = slug(format.name);
    while (ids.has(id)) id += "-2";
    ids.add(id);

    briefs.push({
      id,
      name: format.name,
      whyItWorks: format.whyItWorks ?? "",
      hookPattern: format.hookPattern ?? "",
      beats,
      durationSeconds: Number(format.durationSeconds) || beats[beats.length - 1].toSeconds,
      // We only make fully AI-generated videos, so no library clip is needed.
      recommendedStyle: "ai-generated",
      clipTag: null,
      evidence: proof,
      score: 0,
    });
  }
  if (briefs.length === 0) throw new Error("The LLM returned no usable formats");

  // More proof, and proof that beat its follower count by more, ranks higher.
  const raw = briefs.map((brief) =>
    brief.evidence.reduce((sum, item) => sum + Math.log10(1 + item.viewsPerFollower), 0),
  );
  const best = Math.max(...raw) || 1;
  briefs.forEach((brief, index) => (brief.score = Math.round((raw[index] / best) * 100) / 100));
  briefs.sort((a, b) => b.score - a.score);

  const rejected = (parsed.rejected ?? [])
    .filter((item) => evidence[(item.video ?? 0) - 1])
    .map((item) => ({ url: evidence[(item.video ?? 0) - 1].url, reason: item.reason ?? "" }));

  return { briefs, rejected };
}
