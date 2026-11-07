// Renders Notes-style list screens that build line by line, for the middle of a video.
//   node scripts/list-screens.cjs clips/screens/notes.json clips/screens
// notes.json: {"<name>": {"theme": "dark"|"light", "title": "...", "lines": ["..."], "lead": 1.1}}.
// lead (optional) holds an empty note first, so the hook's text can finish over it.
// Writes <name>.mp4 at 1080x1920 and prints each one's length, to paste into the batch and library.json.
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require(process.env.PUPPETEER_PATH ?? "/Users/benjaminthomas/Documents/Lodavo/dev/lodavo-marketing/node_modules/puppeteer");

const [notesFile, outDir] = process.argv.slice(2);
if (!notesFile || !outDir) throw new Error("Usage: list-screens.cjs <notes.json> <outDir>");
const notes = JSON.parse(readFileSync(notesFile, "utf8"));
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
// Reels' caption and buttons cover everything below this line.
const SAFE_BOTTOM = 1250;

const page = (note, shown, scale) => {
  const theme = note.theme === "light" ? { bg: "#fff", fg: "#000", accent: "#D9A400" } : { bg: "#000", fg: "#fff", accent: "#FFD60A" };
  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;background:${theme.bg};color:${theme.fg};font-family:-apple-system,'SF Pro Text','Helvetica Neue',sans-serif}
  .bar{position:absolute;top:176px;left:44px;right:60px;display:flex;justify-content:space-between;color:${theme.accent};font-size:54px}
  .note{position:absolute;top:292px;left:65px;right:65px}
  h1{font-size:${80 * scale}px;font-weight:700;line-height:1.14;margin:0 0 ${38 * scale}px}
  p{font-size:${62 * scale}px;line-height:1.26;margin:0 0 ${24 * scale}px}
  .off{visibility:hidden}</style>
  <div class="bar"><span>&#8249; Notes</span><span>&#8943;</span></div>
  <div class="note"><h1 class="${shown < 0 ? "off" : ""}">${note.title}</h1>${note.lines.map((line, i) => `<p class="${i < shown ? "" : "off"}">${line}</p>`).join("")}</div>`;
};
const words = (text) => text.split(/\s+/).length;

(async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "screens-"));
  const browser = await puppeteer.launch({ headless: "new" });
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  for (const [name, note] of Object.entries(notes)) {
    let scale = 1;
    for (;;) {
      await tab.setContent(page(note, note.lines.length, scale));
      const bottom = await tab.evaluate(() => document.querySelector(".note").getBoundingClientRect().bottom);
      if (bottom <= SAFE_BOTTOM || scale < 0.6) break;
      scale *= 0.96;
    }
    const list = [];
    let total = 0;
    for (let shown = note.lead ? -1 : 0; shown <= note.lines.length; shown++) {
      await tab.setContent(page(note, shown, scale));
      const png = path.join(temp, `${name}-${shown}.png`);
      await tab.screenshot({ path: png });
      let hold = shown < 0 ? note.lead : shown === 0 ? Math.min(1.2, 0.6 + 0.15 * words(note.title)) : 0.4 + 0.17 * words(note.lines[shown - 1]);
      if (shown === note.lines.length) hold += 0.8;
      list.push(`file '${png}'\nduration ${hold.toFixed(2)}`);
      total += hold;
    }
    list.push(`file '${path.join(temp, `${name}-${note.lines.length}.png`)}'`);
    const listFile = path.join(temp, `${name}.txt`);
    writeFileSync(listFile, `${list.join("\n")}\n`);
    execFileSync(FFMPEG, ["-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "veryfast", "-an", path.join(outDir, `${name}.mp4`)]);
    console.log(name, total.toFixed(2));
  }
  await browser.close();
  rmSync(temp, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
