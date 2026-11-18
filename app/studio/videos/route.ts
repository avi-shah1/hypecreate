// GET /studio/videos: every finished ad video on this machine, newest first.
//   public/renders/<id>.mp4  made by the studio (with <id>.json: format, script, caption)
//   public/out/*.mp4         made separately with GMI (with a .json holding formatId and the prompt)
// Both folders are git-ignored, so this only lists what this laptop has made.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Beat } from "@/lib/contract";
import { DEMO_MODE, DEMO_VIDEOS } from "@/lib/demo";

export interface StudioVideo {
  url: string;
  name: string;
  model: string | null;
  formatId: string | null;
  createdAt: string;
  caption?: string;
  beats?: Beat[];
}

/** Folders of real-clip videos, one per account, plus what the Studio makes itself. */
const REAL_CLIPS = ["renders/made-live", "renders/savewithcher", "renders/fintechben", "renders/notquiterichyet", "renders/investor.haven"];
const FOLDERS = ["renders", ...REAL_CLIPS, "out"];

const MODEL_NAMES: Record<string, string> = {
  "veo-3.1-fast-generate-001": "Veo 3.1 Fast",
  "veo-3.1-generate-001": "Veo 3.1",
  "seedance-2-0-fast-260128": "Seedance 2.0 Fast",
  "kling-v3-omni": "Kling 3",
};

export async function GET() {
  // The demo's videos are listed in data/demo-videos.json: a host can't read public/ at run time.
  if (DEMO_MODE) return Response.json([...DEMO_VIDEOS].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const videos: StudioVideo[] = [];
  for (const folder of FOLDERS) {
    const dir = path.join(process.cwd(), "public", folder);
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const file of files.filter((name) => name.endsWith(".mp4"))) {
      // The studio keeps the clip without the legal line as <id>-raw.mp4: show the finished one.
      if (file.endsWith("-raw.mp4") && files.includes(file.replace("-raw.mp4", ".mp4"))) continue;
      const info = await stat(path.join(dir, file));
      // Still being written by another process: skip until it is finished.
      if (Date.now() - info.mtimeMs < 15_000 || info.size < 50_000) continue;

      const base = file.replace(/(-raw)?\.mp4$/, "");
      const meta = JSON.parse(await readFile(path.join(dir, `${base}.json`), "utf8").catch(() => "{}"));
      const real = REAL_CLIPS.includes(folder);
      const model = typeof meta.model === "string" ? meta.model : real ? "Real clips" : null;
      videos.push({
        url: `/${folder}/${file}`,
        name: meta.formatName ?? base.replace(/^test-[a-z0-9]+-/, "").replace(/^\d+-/, "").replace(/-/g, " "),
        model: model ? (MODEL_NAMES[model] ?? model) : null,
        formatId: meta.formatId ?? null,
        createdAt: info.mtime.toISOString(),
        caption: meta.caption,
        beats: Array.isArray(meta.beats) ? meta.beats : beatsFromPrompt(meta.prompt, meta.payload?.durationSeconds),
      });
    }
  }
  videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Response.json(videos);
}

/** Separately made videos keep their script inside the prompt: 'The creator says: "..."'. */
function beatsFromPrompt(prompt: unknown, duration: unknown): Beat[] | undefined {
  if (typeof prompt !== "string") return undefined;
  const lines = [...prompt.matchAll(/says:\s*"([^"]+)"/g)].map((match) => match[1]);
  if (lines.length === 0) return undefined;
  const total = Number(duration) || 8;
  const step = total / lines.length;
  return lines.map((says, index) => ({
    fromSeconds: Math.round(index * step * 10) / 10,
    toSeconds: Math.round((index + 1) * step * 10) / 10,
    shows: "",
    says,
  }));
}
