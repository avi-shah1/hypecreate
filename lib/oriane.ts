// Oriane client. Field names and behaviour are in docs/apis.md.
import type { Evidence, Platform } from "./contract";

const BASE = "https://connect.oriane.xyz";

export interface OrianeQuery {
  operator: "and" | "or";
  filters?: Record<string, unknown>;
  queries?: OrianeQuery[];
  name?: string;
}

export interface SearchOptions {
  /** Default: breakouts first. Comma-separate fields, each with an optional :asc. */
  sort?: string;
  /** 1 to 100. */
  limit?: number;
  offset?: number;
  projection?: "basic" | "default" | "full";
  /** Returned by the first page of a visual search; needed on later pages. */
  aiSearchAnchor?: string;
}

/** The fields we use from projection=full. The API returns more: see docs/apis.md. */
export interface OrianeContent {
  platform: Platform;
  platformId: string;
  profileHandle: string;
  caption?: string | null;
  thumbnailMediaUrl?: string | null;
  viewsCount?: number | null;
  profileFollowersCount?: number | null;
  viewsRatePerFollowers?: number | null;
  engagementRatePerViews?: number | null;
  audioTitle?: string | null;
  publishedAt: string;
  media?: {
    duration?: number | null;
    transcript?: string | null;
    onScreenText?: string[] | null;
    transcriptChunks?: { startSeconds: number; endSeconds: number; text: string }[] | null;
    frames?: { timestampSeconds: number; url: string }[] | null;
  }[];
  popularComments?: { content: string }[] | null;
}

/**
 * Keeps out likely paid reach, which otherwise tops every chart: a caption that
 * says it is an ad, or engagement far below normal. In a test of the top 100
 * videos mentioning an app, 40 were under 1% engagement (one had 1M views at
 * 0.1%, from a brand account), against a 2.6% median.
 */
export const ORGANIC_ONLY = {
  caption: {
    excludesFuzzy: {
      values: [
        "#ad",
        "#ads",
        "#sponsored",
        "#partner",
        "sponsored",
        "paid partnership",
        "ad |",
        "#publicité",
        "publicité",
      ],
      operator: "or",
    },
  },
  engagementRatePerViews: { min: 1 },
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.ORIANE_API_KEY;
  if (!key) throw new Error("ORIANE_API_KEY is missing from .env.local");
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // A search with more pages to come answers 206, which res.ok accepts.
  const json = await res.json();
  if (!res.ok) throw new Error(`Oriane ${res.status}: ${JSON.stringify(json.error)}`);
  return json as T;
}

export async function searchContents(query: OrianeQuery, options: SearchOptions = {}) {
  const params = new URLSearchParams({
    sort: options.sort ?? "viewsRatePerFollowers:desc",
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0),
    projection: options.projection ?? "full",
  });
  if (options.aiSearchAnchor) params.set("aiSearchAnchor", options.aiSearchAnchor);
  const json = await post<{
    data: { results: OrianeContent[]; aggregations: Record<string, number | null> };
    metadata: { pagination: { totalCount: number; aiSearchAnchor?: string } };
  }>(`/rest/contents/search?${params}`, query);
  return {
    results: json.data.results,
    aggregations: json.data.aggregations,
    pagination: json.metadata.pagination,
  };
}

/** A description to search by what videos show. Use its id in a visualSimilarity filter. */
export async function createTextAsset(text: string): Promise<string> {
  const json = await post<{ data: { id: string } }>("/rest/assets", { type: "text", text });
  return json.data.id;
}

/** An image to search by what videos show: a frame of a breakout finds look-alikes. */
export async function createImageAsset(url: string): Promise<string> {
  const json = await post<{ data: { id: string } }>("/rest/assets", {
    type: "image",
    image: { type: "url", url },
  });
  return json.data.id;
}

function postUrl(content: OrianeContent): string {
  if (content.platform === "tiktok") {
    return `https://www.tiktok.com/@${content.profileHandle}/video/${content.platformId}`;
  }
  if (content.platform === "instagram") {
    return `https://www.instagram.com/reel/${content.platformId}/`;
  }
  return `https://www.youtube.com/watch?v=${content.platformId}`;
}

/** Reduces a full search result to what a FormatBrief needs. */
export function toEvidence(content: OrianeContent): Evidence {
  const media = content.media?.[0];
  const frames = media?.frames ?? [];
  const stride = Math.max(1, Math.floor(frames.length / 4));
  const chunks = media?.transcriptChunks ?? [];
  const opening = chunks
    .filter((chunk) => chunk.startSeconds < 3)
    .map((chunk) => chunk.text)
    .join(" ");
  return {
    url: postUrl(content),
    platform: content.platform,
    handle: content.profileHandle,
    thumbnailUrl: content.thumbnailMediaUrl ?? null,
    frameUrls: frames
      .filter((_, index) => index % stride === 0)
      .slice(0, 4)
      .map((frame) => frame.url),
    views: content.viewsCount ?? 0,
    followers: content.profileFollowersCount ?? 0,
    // The API gives a percentage; we want a multiple.
    viewsPerFollower: Math.round(content.viewsRatePerFollowers ?? 0) / 100,
    engagementRatePerViews: content.engagementRatePerViews ?? 0,
    // Some transcripts come as one long chunk, so cap it at the opening words.
    spokenHook: opening.split(/\s+/).slice(0, 15).join(" "),
    onScreenText: (media?.onScreenText ?? []).slice(0, 12),
    audioTitle: content.audioTitle ?? null,
    durationSeconds: media?.duration ?? 0,
    topComments: (content.popularComments ?? []).slice(0, 5).map((comment) => comment.content),
    publishedAt: content.publishedAt,
  };
}
