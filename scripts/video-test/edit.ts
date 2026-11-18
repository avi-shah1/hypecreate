// Edit pass: turns a generated multi-shot clip into a TikTok-style cut, driven by the same
// storyboard that generated it (prompts/<formatId>.multi.json):
//   - push-ins and hard punch-ins on the talking shots, a VHS or glow look on the B-roll
//   - a white flash and a whoosh on every cut, snapped to the cuts the model actually made
//   - captions from each shot, an end card, and the Lodavo legal line on the last 3 s
//     whenever the copy mentions winning or prizes (brand/lodavo.md)
//
//   node scripts/video-test/edit.ts <input.mp4> <storyboard.json> [output.mp4]
//
// Free and local: ffmpeg only. Output defaults to public/out/edit-<input name>.mp4.

import type { Story } from "./run";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../public/out");
const TMP = resolve(OUT_DIR, "edit-tmp");
const W = 1080;
const H = 1920;
const FPS = 30;

// Word for word from brand/lodavo.md, split over two lines to fit the frame.
const LEGAL_EN = ["No purchase necessary. STQ required.", "Rules & odds: lodavo.com/rules"];
const NEEDS_LEGAL_LINE = /\b(win|wins|won|winning|winner|prizes?|jackpot)\b/i;

const FONT_CANDIDATES = {
  heavy: [
    "C:/Windows/Fonts/seguibl.ttf",
    "C:/Windows/Fonts/ariblk.ttf",
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/Library/Fonts/Arial Black.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  ],
  bold: [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  ],
  mono: [
    "C:/Windows/Fonts/consolab.ttf",
    "C:/Windows/Fonts/courbd.ttf",
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
  ],
};

function font(kind: keyof typeof FONT_CANDIDATES): string {
  const found = FONT_CANDIDATES[kind].find((path) => existsSync(path));
  if (!found) throw new Error(`No ${kind} font found. Add one to FONT_CANDIDATES.`);
  return ffPath(found);
}

/** A path ffmpeg's filter parser accepts: relative when possible, colons escaped otherwise. */
function ffPath(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/").replaceAll(":", "\\:");
}

function ff(args: string[]): string {
  const run = spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1e8 });
  if (run.status !== 0) {
    throw new Error(`ffmpeg failed:\n${run.stderr.split("\n").slice(-25).join("\n")}`);
  }
  return run.stderr;
}

function probe(file: string) {
  const run = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", file],
    { encoding: "utf8" },
  );
  const info = JSON.parse(run.stdout) as { streams: { codec_type: string }[]; format: { duration: string } };
  return { seconds: Number(info.format.duration), hasAudio: info.streams.some((s) => s.codec_type === "audio") };
}

/** Where the model actually cut, so effects land on real cuts rather than planned ones. */
function detectCuts(file: string): number[] {
  const log = ff(["-i", file, "-an", "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"]);
  return [...log.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number(match[1]));
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

let textFiles = 0;
/** drawtext reads text from a file, so quotes, colons and ampersands need no escaping. */
function textFile(text: string): string {
  const path = resolve(TMP, `t${textFiles++}.txt`);
  writeFileSync(path, text);
  return ffPath(path);
}

function drawText(opts: {
  text: string;
  font: string;
  size: number;
  y: string;
  from: number;
  to: number;
  x?: string;
  extra?: string;
}): string {
  const fade = `alpha='min(1,(t-${opts.from.toFixed(3)})/0.12)'`;
  return [
    `drawtext=fontfile='${opts.font}'`,
    `textfile='${textFile(opts.text)}'`,
    "expansion=none",
    `fontsize=${opts.size}`,
    "fontcolor=white",
    `x=${opts.x ?? "(w-text_w)/2"}`,
    `y=${opts.y}`,
    fade,
    `enable='between(t,${opts.from.toFixed(3)},${opts.to.toFixed(3)})'`,
    ...(opts.extra ? [opts.extra] : []),
  ].join(":");
}

function main() {
  const [input, storyPath, outArg] = process.argv.slice(2);
  if (!input || !storyPath) {
    console.log("Usage: node scripts/video-test/edit.ts <input.mp4> <storyboard.json> [output.mp4]");
    process.exit(1);
  }
  const story = JSON.parse(readFileSync(storyPath, "utf8")) as Story;
  const out = outArg ? resolve(outArg) : resolve(OUT_DIR, `edit-${basename(input)}`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const media = probe(input);
  const gen = Math.min(
    media.seconds,
    story.shots.reduce((sum, shot) => sum + shot.seconds, 0),
  );
  const endSeconds = story.endCard?.seconds ?? 0;
  const total = gen + endSeconds;

  // Planned cut points, snapped to the nearest real cut within 0.6 s.
  const detected = detectCuts(input);
  const bounds = [0];
  for (const shot of story.shots.slice(0, -1)) {
    const planned = bounds.at(-1)! + shot.seconds;
    const near = detected.filter((t) => Math.abs(t - planned) < 0.6).sort((a, b) => Math.abs(a - planned) - Math.abs(b - planned));
    bounds.push(near[0] ?? planned);
  }
  bounds.push(gen);
  console.log(`Cuts planned vs used: ${bounds.map((b) => b.toFixed(2)).join(", ")} (model cut at ${detected.map((t) => t.toFixed(2)).join(", ") || "none detected"})`);

  const heavy = font("heavy");
  const bold = font("bold");
  const mono = font("mono");
  const graph: string[] = [];

  // One chain per shot.
  graph.push(`[0:v]split=${story.shots.length}${story.shots.map((_, i) => `[s${i}]`).join("")}`);
  story.shots.forEach((shot, i) => {
    const [from, to] = [bounds[i], bounds[i + 1]];
    const frames = Math.max(1, Math.round((to - from) * FPS));
    const chain = [
      `[s${i}]trim=start=${from.toFixed(3)}:end=${to.toFixed(3)}`,
      "setpts=PTS-STARTPTS",
      `fps=${FPS}`,
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      "setsar=1",
    ];
    if (shot.zoom === "punch") chain.push("crop=iw/1.15:ih/1.15", `scale=${W}:${H}`);
    if (shot.zoom === "push" || shot.look === "glow") {
      chain.push(
        `scale=${W * 1.5}:${H * 1.5}`,
        `zoompan=z='1+0.08*on/${frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}`,
      );
    }
    if (shot.look === "vhs") {
      chain.push(
        "eq=saturation=0.7:contrast=1.08",
        "rgbashift=rh=-6:bh=6",
        "noise=alls=16:allf=t",
        "gblur=sigma=0.7",
        drawText({ text: "PLAY", font: mono, size: 64, x: "70", y: "110", from: 0, to: 99, extra: "shadowx=3:shadowy=3" }),
        drawText({ text: "JUN 14 1998", font: mono, size: 56, x: "70", y: "h-260", from: 0, to: 99, extra: "shadowx=3:shadowy=3" }),
      );
    }
    let line = chain.join(",");
    if (shot.look === "glow") {
      // Blend in RGB: a screen blend on YUV planes shifts the hue to magenta.
      line += `,format=gbrp,split[g${i}a][g${i}b];[g${i}b]gblur=sigma=30[g${i}c];[g${i}a][g${i}c]blend=all_mode=screen:all_opacity=0.45`;
    }
    graph.push(`${line},setsar=1,format=yuv420p[v${i}]`);
  });

  // Join, hold the last frame for the end card, then flashes, captions, end card and legal line.
  const post = [
    `${story.shots.map((_, i) => `[v${i}]`).join("")}concat=n=${story.shots.length}:v=1:a=0`,
    ...(endSeconds
      ? [
          `tpad=stop_mode=clone:stop_duration=${endSeconds}`,
          `boxblur=luma_radius=24:luma_power=2:enable='gte(t,${gen.toFixed(3)})'`,
          `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.5:t=fill:enable='gte(t,${gen.toFixed(3)})'`,
        ]
      : []),
  ];
  const cuts = [...bounds.slice(1, -1), ...(endSeconds ? [gen] : [])];
  for (const cut of cuts) {
    post.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.8:t=fill:enable='between(t,${(cut - 0.03).toFixed(3)},${(cut + 0.07).toFixed(3)})'`);
  }
  story.shots.forEach((shot, i) => {
    if (!shot.caption) return;
    const top = shot.captionAt === "top" ? H * 0.13 : H * 0.62;
    wrap(shot.caption, 18).forEach((text, j) => {
      post.push(
        drawText({
          text,
          font: heavy,
          size: 80,
          y: String(Math.round(top + j * 100)),
          from: bounds[i] + 0.05,
          to: bounds[i + 1],
          extra: "borderw=7:bordercolor=black",
        }),
      );
    });
  });
  // End card: the first line is the title, the rest wrap to fit the frame.
  let endY = H * 0.32;
  story.endCard?.lines.forEach((text, j) => {
    const size = j === 0 ? 150 : 62;
    const rows = j === 0 ? [text] : wrap(text, 24);
    rows.forEach((row) => {
      post.push(drawText({ text: row, font: heavy, size, y: String(Math.round(endY)), from: gen + 0.1 + j * 0.25, to: total }));
      endY += j === 0 ? 210 : 82;
    });
    if (j > 0) endY += 20;
  });
  const copy = [...story.shots.flatMap((s) => [s.says ?? "", s.caption ?? ""]), ...(story.endCard?.lines ?? [])].join(" ");
  const legal = NEEDS_LEGAL_LINE.test(copy);
  if (legal) {
    LEGAL_EN.forEach((text, j) => {
      post.push(
        drawText({
          text,
          font: bold,
          size: 38,
          y: String(Math.round(H * 0.8 + j * 56)),
          from: total - 3,
          to: total,
          extra: "box=1:boxcolor=black@0.55:boxborderw=10",
        }),
      );
    });
  }
  graph.push(`${post.join(",")},format=yuv420p[vout]`);

  // Audio: the model's own sound, a whoosh on each cut, a soft chime on the end card.
  const sfx = cuts.length;
  graph.push(
    media.hasAudio
      ? `[0:a]atrim=0:${gen.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,apad[a0]`
      : "anullsrc=r=48000:cl=stereo[a0]",
  );
  if (sfx) {
    graph.push(
      `anoisesrc=d=0.4:c=pink:r=48000:a=0.5,highpass=f=500,lowpass=f=7000,afade=t=in:d=0.15,afade=t=out:st=0.15:d=0.25,volume=0.35,asplit=${sfx}${cuts.map((_, i) => `[w${i}]`).join("")}`,
    );
    cuts.forEach((cut, i) => graph.push(`[w${i}]adelay=delays=${Math.max(0, Math.round((cut - 0.18) * 1000))}:all=1[d${i}]`));
  }
  const chime = endSeconds ? 1 : 0;
  if (chime) graph.push(`sine=f=1318:d=0.6:r=48000,afade=t=out:st=0.02:d=0.55,volume=0.2,adelay=delays=${Math.round(gen * 1000)}:all=1[chime]`);
  graph.push(
    `[a0]${cuts.map((_, i) => `[d${i}]`).join("")}${chime ? "[chime]" : ""}amix=inputs=${1 + sfx + chime}:normalize=0:duration=first[aout]`,
  );

  const graphPath = resolve(TMP, "graph.txt");
  writeFileSync(graphPath, graph.join(";\n"));
  ff([
    "-y",
    "-i",
    input,
    "-/filter_complex",
    graphPath,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    total.toFixed(3),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    out,
  ]);
  rmSync(TMP, { recursive: true, force: true });

  const megabytes = (statSync(out).size / 1e6).toFixed(1);
  console.log(`Done: ${relative(process.cwd(), out).replaceAll("\\", "/")} (${total.toFixed(1)} s, ${megabytes} MB${legal ? ", legal line on the last 3 s" : ""})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
