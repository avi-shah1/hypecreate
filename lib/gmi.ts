// GMI Cloud client: one key for text, image, video and speech models.
// Endpoints, models and prices are in docs/apis.md.

const CHAT_URL = "https://api.gmi-serving.com/v1/chat/completions";
const QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";

export const MODELS = {
  /**
   * Best first, moving on when one is unavailable. Claude answers 429 on our key
   * today, and Opus 5.5 and Fable 5.1 are not on GMI (404). Tested 2026-11-06.
   */
  chat: ["anthropic/claude-opus-5", "openai/gpt-6.1-sol", "google/gemini-4-argon"],
  speech: "minimax-tts-speech-2.8-turbo",
} as const;

/** Vertical video models, best first. Each entry builds that model's payload. */
const VIDEO_MODELS: { model: string; costPerSecond: number; payload: (prompt: string, seconds: number) => object }[] = [
  {
    model: "veo-3.1-fast-generate-001",
    costPerSecond: 0.15,
    payload: (prompt, seconds) => ({
      prompt,
      aspectRatio: "9:16",
      // A string: Veo answers 500 to a number here. Tested 2026-11-06, 53 s for 6 s of video.
      durationSeconds: String(
        [4, 6, 8].reduce((best, s) => (Math.abs(s - seconds) < Math.abs(best - seconds) ? s : best)),
      ),
    }),
  },
  {
    // 186 s for 6 s of video in the same test, so it is the fallback.
    model: "seedance-2-0-fast-260128",
    costPerSecond: 0,
    payload: (prompt, seconds) => ({ prompt, ratio: "9:16", duration: Math.max(4, Math.min(15, Math.round(seconds))) }),
  },
];

function apiKey(): string {
  const key = process.env.GMI_API_KEY;
  if (!key) throw new Error("GMI_API_KEY is missing from .env.local");
  return key;
}

export type ChatContent =
  | string
  | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

export async function chat(
  messages: { role: "system" | "user" | "assistant"; content: ChatContent }[],
  options: { model?: string; maxTokens?: number } = {},
): Promise<string> {
  const models = options.model ? [options.model] : MODELS.chat;
  let lastError = "";
  for (const model of models) {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: options.maxTokens ?? 16000, messages }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json.choices[0].message.content;
    lastError = `GMI chat ${model} ${res.status}: ${JSON.stringify(json)}`;
    if (![404, 429].includes(res.status) && res.status < 500) throw new Error(lastError);
  }
  throw new Error(lastError);
}

/**
 * Runs a video, image or speech job and returns the URLs of what it made.
 * Every job costs credits, so never call this in a loop without a cap.
 */
export async function generate(
  model: string,
  payload: object,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string[]> {
  const headers = { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" };
  const submitted = await fetch(QUEUE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, payload }),
  });
  const job = await submitted.json();
  if (!submitted.ok) throw new Error(`GMI submit ${submitted.status}: ${JSON.stringify(job)}`);

  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60_000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 4000));
    const polled = await fetch(`${QUEUE_URL}/${job.request_id}`, { headers });
    const state = await polled.json();
    if (!polled.ok) throw new Error(`GMI poll ${polled.status}: ${JSON.stringify(state)}`);
    // GMI's docs name the finished state both ways, and the result in two shapes.
    if (state.status === "success" || state.status === "finished") {
      const outcome = state.outcome ?? {};
      const urls: string[] = (outcome.media_urls ?? []).map((media: { url: string }) => media.url);
      if (outcome.video_url) urls.push(outcome.video_url);
      return urls;
    }
    if (state.status === "failed" || state.status === "cancelled") {
      throw new Error(`GMI job ${state.status}: ${JSON.stringify(state)}`);
    }
  }
  throw new Error(`GMI job ${job.request_id} still running after the timeout`);
}

export interface GeneratedClip {
  url: string;
  model: string;
  costUsd: number;
}

/** One vertical clip, from the first video model that delivers. */
export async function generateClip(prompt: string, seconds: number): Promise<GeneratedClip> {
  let lastError: unknown;
  for (const option of VIDEO_MODELS) {
    try {
      const [url] = await generate(option.model, option.payload(prompt, seconds));
      if (url) return { url, model: option.model, costUsd: option.costPerSecond * seconds };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No video model returned a clip");
}
