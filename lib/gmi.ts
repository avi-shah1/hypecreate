// GMI Cloud client: one key for text, image, video and speech models.
// Endpoints, models and prices are in docs/apis.md.

const CHAT_URL = "https://api.gmi-serving.com/v1/chat/completions";
const QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";

export const MODELS = {
  /** Takes images as well as text, so it can read Oriane's frames. */
  chat: "anthropic/claude-sonnet-4.6",
  /** $0.15 a second. 4, 6 or 8 s. Vertical through aspectRatio. */
  video: "veo-3.1-fast-generate-001",
  /** 4 to 15 s. Vertical through ratio. Takes reference images and videos. */
  videoWithReferences: "seedance-2-0-fast-260128",
  speech: "minimax-tts-speech-2.8-turbo",
} as const;

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
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? MODELS.chat,
      max_tokens: options.maxTokens ?? 2000,
      messages,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GMI chat ${res.status}: ${JSON.stringify(json)}`);
  return json.choices[0].message.content;
}

/**
 * Runs a video, image or speech job and returns the URLs of what it made.
 * Every job costs credits, so never call this in a loop without a cap.
 */
export async function generate(
  model: string,
  payload: Record<string, unknown>,
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
