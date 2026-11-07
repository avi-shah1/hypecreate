// The studio's client for making a video from one format. Three backends, one switch:
//   "studio"  /studio/generate: real GMI generation (Veo 3.1 Fast, about $1.20 a video)
//   "ben"     Ben's /api/generate, same shape, once it is live
//   "mock"    ./mock-generate.ts: fake steps and a sample video, free
import type { Beat, CreateResult, FormatBrief } from "@/lib/contract";
import { mockGet, mockStart } from "./mock-generate";

export const GENERATE_WITH = "ben" as "studio" | "ben" | "mock";

export const USE_MOCK_GENERATE = GENERATE_WITH === "mock";
const ENDPOINT = GENERATE_WITH === "ben" ? "/api/generate" : "/studio/generate";

/** How often the studio asks for news. Real video jobs take minutes. */
export const GENERATE_POLL_MS = USE_MOCK_GENERATE ? 500 : 2000;

export interface GenerateRequest {
  signalSlug: string;
  formatId: string;
  /** From the studio's Brand box, e.g. "Lodavo". The brand file is brand/<lowercase>.md. */
  brand: string;
  /** Real clips unless this says otherwise. */
  style?: "hook-plus-demo" | "broll-text" | "ai-generated";
}

export interface GenerateResult extends Partial<CreateResult> {
  videoUrl: string;
  /** The script rewritten for the brand, beat by beat, if the backend returns it. */
  beats?: Beat[];
}

export interface GenerateStatus {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  /** Human words for the current step, e.g. "Generating scenes". */
  stage?: string;
  result?: GenerateResult;
  error?: string;
}

/** `brief` is only used by the mock, which has no backend to look the format up in. */
export async function startGenerate(request: GenerateRequest, brief: FormatBrief): Promise<{ jobId: string }> {
  if (USE_MOCK_GENERATE) return mockStart(request, brief);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.jobId) throw new Error(json.error ?? `Generate failed: HTTP ${res.status}`);
  return { jobId: json.jobId };
}

export async function getGenerate(jobId: string): Promise<GenerateStatus> {
  if (USE_MOCK_GENERATE) return mockGet(jobId);
  const res = await fetch(`${ENDPOINT}?jobId=${encodeURIComponent(jobId)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { jobId, status: "error", error: json.error ?? `HTTP ${res.status}` };
  return normalize(jobId, json);
}

/** Accepts the shapes a backend is likely to send, so a small mismatch doesn't break the stage demo. */
function normalize(jobId: string, json: Record<string, unknown>): GenerateStatus {
  const raw = String(json.status ?? "running").toLowerCase();
  const result = (json.result ?? (json.videoUrl ? json : undefined)) as GenerateResult | undefined;
  const status: GenerateStatus["status"] =
    ["done", "success", "finished", "ready"].includes(raw) || (result?.videoUrl && raw !== "error")
      ? "done"
      : ["error", "failed", "cancelled"].includes(raw)
        ? "error"
        : raw === "queued"
          ? "queued"
          : "running";
  return {
    jobId,
    status,
    stage: typeof json.stage === "string" ? json.stage : undefined,
    result: status === "done" ? result : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
  };
}
