// The one interface between the two halves of the product.
//   Avi (signal): POST /api/signal returns FormatBrief[]
//   Ben (create): POST /api/create takes a CreateRequest, returns a CreateResult
// Change this file together, in its own commit, and tell the other person.
// fixtures/format-brief.example.json is a real example, so each side can build
// against it before the other side is finished.

export type Platform = "tiktok" | "instagram" | "youtube";

/** How a finished video gets made. */
export type VideoStyle =
  | "hook-plus-demo" // a real clip from the library as the hook, then the app demo
  | "broll-text" // b-roll (library or generated) with text on screen
  | "ai-generated"; // every scene generated

/** A real video that proves a format works. Built by toEvidence() in lib/oriane.ts. */
export interface Evidence {
  url: string;
  platform: Platform;
  handle: string;
  thumbnailUrl: string | null;
  /** What it shows: a few frames, earliest first. Public URLs. */
  frameUrls: string[];
  views: number;
  followers: number;
  /** 141.6 means views were 141.6 times the account's followers. */
  viewsPerFollower: number;
  /** Percentage. Far below normal for its views usually means paid reach. */
  engagementRatePerViews: number;
  /** What it says: the start of the transcript. */
  spokenHook: string;
  /** What it writes on screen. */
  onScreenText: string[];
  /** What it sounds like. */
  audioTitle: string | null;
  durationSeconds: number;
  topComments: string[];
  publishedAt: string;
}

/** One beat of a format, in order. */
export interface Beat {
  fromSeconds: number;
  toSeconds: number;
  shows: string;
  says?: string;
  onScreen?: string;
}

/** A format that is working right now, ready to be made again for a brand. */
export interface FormatBrief {
  id: string;
  name: string;
  whyItWorks: string;
  /** The hook as a fill-in-the-blank: "How much did you spend on [everyday thing] today?" */
  hookPattern: string;
  beats: Beat[];
  durationSeconds: number;
  recommendedStyle: VideoStyle;
  /** Tag of the library clip this format needs, or null if it needs none. */
  clipTag: string | null;
  evidence: Evidence[];
  /** Higher means make this one first. */
  score: number;
}

/** A reusable piece of footage in clips/. Only cleared clips may be used. */
export interface Clip {
  /** Path inside clips/. */
  file: string;
  person: string | null;
  /** "reaction", "talking-to-camera", "app-demo", "b-roll" */
  tags: string[];
  seconds: number;
  /** True when the person on screen signed a release that covers reuse. */
  cleared: boolean;
}

export interface CreateRequest {
  brief: FormatBrief;
  /** Defaults to brief.recommendedStyle. */
  style?: VideoStyle;
  /** File name in brand/, without the extension. */
  brand: string;
  language: "en" | "fr";
  /** Whose clips to use. */
  person?: string;
}

export interface CreateResult {
  videoUrl: string;
  caption: string;
  script: string;
  style: VideoStyle;
  clipsUsed: string[];
  generationCostUsd: number;
}

/**
 * What a posted video did, read from the platform's own analytics: Oriane does
 * not index accounts under 5,000 followers. This is what closes the loop.
 */
export interface PostResult {
  postedAt: string;
  account: string;
  formatId: string;
  style: VideoStyle;
  clipsUsed: string[];
  views: number;
  likes: number;
  linkClicks: number | null;
}
