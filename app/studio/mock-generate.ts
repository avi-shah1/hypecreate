// Stand-in for Ben's /api/generate so the studio works end to end today.
// Same shape as the real thing: start returns a jobId, get reports the step.
// Switch it off with USE_MOCK_GENERATE in ./generate.ts.
import type { Beat, FormatBrief } from "@/lib/contract";
import type { GenerateRequest, GenerateStatus } from "./generate";

const SAMPLE_VIDEO = "/studio/sample-ad.mp4";

const STEPS = [
  { until: 1000, stage: "Writing the script" },
  { until: 2500, stage: "Generating scenes" },
  { until: 4000, stage: "Adding the voiceover" },
  { until: 5000, stage: "Putting it together" },
];

// Placeholder copy built only from facts in brand/lodavo.md, following its "Never say" list.
const LINES = [
  { says: "I used to think saving money was boring.", onScreen: "Saving is boring?" },
  { says: "Then I found a savings app that gives you free tickets just for saving.", onScreen: "Free tickets for saving" },
  { says: "Every $25 you have saved earns a free ticket, every week.", onScreen: "$25 saved = 1 free ticket" },
  { says: "A winning number is revealed every night at 8 PM ET.", onScreen: "A number every night" },
  { says: "Your savings stay in your own account, and you get a chance to win cash every week.", onScreen: "A chance to win every week" },
];
const LEGAL = "No purchase necessary. STQ required. Rules & odds: lodavo.com/rules";

const jobs = new Map<string, { startedAt: number; request: GenerateRequest; brief: FormatBrief }>();

export function mockStart(request: GenerateRequest, brief: FormatBrief): { jobId: string } {
  const jobId = `mock-${brief.id}-${Date.now()}`;
  jobs.set(jobId, { startedAt: Date.now(), request, brief });
  return { jobId };
}

export function mockGet(jobId: string): GenerateStatus {
  const job = jobs.get(jobId);
  if (!job) return { jobId, status: "error", error: "Unknown mock job" };

  const elapsed = Date.now() - job.startedAt;
  const step = STEPS.find((candidate) => elapsed < candidate.until);
  if (step) return { jobId, status: elapsed < 300 ? "queued" : "running", stage: step.stage };

  const beats: Beat[] = job.brief.beats.map((beat, index, all) => {
    const line = LINES[Math.min(index, LINES.length - 1)];
    const last = index === all.length - 1;
    return {
      fromSeconds: beat.fromSeconds,
      toSeconds: beat.toSeconds,
      shows: beat.shows,
      says: last ? LINES[LINES.length - 1].says : line.says,
      // The legal line shows at the end of any video that mentions winning.
      onScreen: last ? LEGAL : line.onScreen,
    };
  });

  return {
    jobId,
    status: "done",
    stage: "Done",
    result: {
      videoUrl: SAMPLE_VIDEO,
      caption: "Free tickets for saving, and a chance to win cash every week. Rules: lodavo.com/rules",
      script: beats.map((beat) => beat.says).join("\n"),
      style: "ai-generated",
      clipsUsed: [],
      generationCostUsd: 0,
      beats,
    },
  };
}
