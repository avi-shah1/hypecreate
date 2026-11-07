// Cuts clips into a finished 1080x1920 MP4 with on-screen text. ffmpeg only.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const FONT = path.join(process.cwd(), "brand", "fonts", "TikTokSans-ExtraBold.ttf");

export interface Scene {
  /** Absolute path to the source clip. */
  file: string;
  /** Where to start in the source clip, in seconds. */
  start?: number;
  seconds: number;
  /** On-screen text. Newlines are kept; long lines are wrapped. */
  text?: string;
  /** Playback speed: 0.9 slows the clip by a tenth. seconds is the length on screen. */
  speed?: number;
  /** A slight zoom, pan and grade, so footage shared between videos isn't the same pixels. */
  look?: Look;
}

export interface Look {
  /** 1.015 to 1.04. */
  zoom: number;
  /** 0 to 1: where the crop sits inside the zoomed frame. */
  x: number;
  y: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

/** Keeps a line inside the 6% side margins at this font size. */
function wrap(text: string, maxChars = 26): string {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** drawtext reads the words from a file, so nothing in them needs escaping. */
function drawText(textFile: string, options: { size: number; y: string; border: number; enable?: string }): string {
  const parts = [
    `fontfile=${FONT}`,
    `textfile=${textFile}`,
    // Otherwise a % in the words ("saving > 50%") is read as a format code.
    "expansion=none",
    `fontsize=${options.size}`,
    "fontcolor=white",
    `borderw=${options.border}`,
    "bordercolor=black",
    "line_spacing=14",
    "text_align=C",
    "x=(w-text_w)/2",
    `y=${options.y}`,
  ];
  if (options.enable) parts.push(`enable='${options.enable}'`);
  return `drawtext=${parts.join(":")}`;
}

function lookSteps(look: Look): string[] {
  const width = Math.round(540 * look.zoom) * 2;
  const height = Math.round(960 * look.zoom) * 2;
  return [
    `scale=${width}:${height}`,
    `crop=1080:1920:${Math.round((width - 1080) * look.x)}:${Math.round((height - 1920) * look.y)}`,
    `eq=brightness=${look.brightness}:contrast=${look.contrast}:saturation=${look.saturation}`,
  ];
}

/**
 * Text sits at the top of Reels' and TikTok's safe band: below the top 14% and
 * above the bottom 35%. The legal line alone goes below it, for the last 3 seconds.
 */
export async function renderVideo(scenes: Scene[], outFile: string, legalLine?: string, music?: string): Promise<void> {
  const temp = await mkdtemp(path.join(os.tmpdir(), "render-"));
  try {
    const inputs: string[] = [];
    const filters: string[] = [];
    const labels: string[] = [];
    let total = 0;

    for (const [index, scene] of scenes.entries()) {
      const speed = scene.speed ?? 1;
      inputs.push("-ss", String(scene.start ?? 0), "-t", String(scene.seconds * speed), "-i", scene.file);
      const steps = [
        ...(speed === 1 ? [] : [`setpts=PTS/${speed}`]),
        "scale=1080:1920:force_original_aspect_ratio=increase",
        "crop=1080:1920",
        ...(scene.look ? lookSteps(scene.look) : []),
        "setsar=1",
        "fps=30",
        "format=yuv420p",
      ];
      if (scene.text) {
        const textFile = path.join(temp, `text-${index}.txt`);
        await writeFile(textFile, wrap(scene.text));
        steps.push(drawText(textFile, { size: 66, y: "290", border: 7 }));
      }
      filters.push(`[${index}:v]${steps.join(",")}[v${index}]`);
      labels.push(`[v${index}]`);
      total += scene.seconds;
    }

    filters.push(`${labels.join("")}concat=n=${scenes.length}:v=1:a=0[joined]`);
    let last = "joined";
    if (legalLine) {
      const legalFile = path.join(temp, "legal.txt");
      await writeFile(legalFile, wrap(legalLine, 60));
      const from = Math.max(0, total - 3);
      filters.push(
        `[joined]${drawText(legalFile, { size: 27, y: "h-text_h-92", border: 2, enable: `gte(t,${from})` })}[final]`,
      );
      last = "final";
    }

    await mkdir(path.dirname(outFile), { recursive: true });
    await run(
      FFMPEG,
      [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        ...inputs,
        // Instagram's web uploader can't add a sound, so a video never goes out silent.
        ...(music ? ["-t", String(total), "-stream_loop", "-1", "-i", music] : ["-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=44100:cl=stereo"]),
        "-filter_complex", filters.join(";"),
        "-map", `[${last}]`, "-map", `${scenes.length}:a`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        ...(music ? ["-af", `afade=t=out:st=${Math.max(0, total - 0.6)}:d=0.6`] : []),
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        outFile,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
