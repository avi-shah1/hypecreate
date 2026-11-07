// Renders a note in iOS 26's Notes app, light mode, building line by line, for the middle of a video.
//   node scripts/list-screens.cjs clips/screens/notes.json clips/screens
// notes.json: {"<name>": {"title": "...", "lines": ["...", "" for an empty line], "time": "10:42", "battery": 0.7}}.
// Writes <name>.mp4 at 1080x1920 and prints each one's length, to paste into the batch and library.json.
//
// Matched to Apple's own iOS 26 Notes screenshots (support.apple.com, "Create and format notes on iPhone"):
// a white page with no status-bar island (screenshots don't capture it), a glass back button and a glass
// share/more capsule, a bold 28 pt title, 17 pt body text on a 26.5 pt line, 24 pt margins, and the glass
// toolbar at the bottom. The note's text is a dark grey (#333), as in those screenshots; the icons are near black. The frame is the screen at 402 pt wide, cut to 9:16 between the top and bottom chrome.
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require(process.env.PUPPETEER_PATH ?? "/Users/benjaminthomas/Documents/Lodavo/dev/lodavo-marketing/node_modules/puppeteer");

const [notesFile, outDir] = process.argv.slice(2);
if (!notesFile || !outDir) throw new Error("Usage: list-screens.cjs <notes.json> <outDir>");
const notes = JSON.parse(readFileSync(notesFile, "utf8"));
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const PT = 1080 / 402; // device pixels per point
const HEIGHT_PT = 1920 / PT;
const INK = "#1d1d1f";

const icon = {
  back: `<svg width="13" height="22" viewBox="0 0 13 22"><path d="M11 2 2 11l9 9" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  share: `<svg width="20" height="25" viewBox="0 0 20 25" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v13M5.5 6.5 10 2l4.5 4.5"/><path d="M7 10H4.5A1.5 1.5 0 0 0 3 11.5v10A1.5 1.5 0 0 0 4.5 23h11a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 15.5 10H13"/></svg>`,
  more: `<svg width="22" height="6" viewBox="0 0 22 6"><circle cx="3" cy="3" r="2.3" fill="${INK}"/><circle cx="11" cy="3" r="2.3" fill="${INK}"/><circle cx="19" cy="3" r="2.3" fill="${INK}"/></svg>`,
  checklist: `<svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="5" r="3.6"/><path d="M3.3 5.1l1.3 1.3 2.4-2.6" stroke-width="1.6"/><circle cx="5" cy="16.5" r="3.6"/><path d="M12 5h12M12 16.5h12"/></svg>`,
  clip: `<svg width="18" height="24" viewBox="0 0 18 24" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"><path d="M14.5 10.5 8 17a3.5 3.5 0 0 1-5-5l8-8a2.4 2.4 0 0 1 3.4 3.4L7 14.8a1.2 1.2 0 0 1-1.7-1.7L12 6.4"/></svg>`,
  pen: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="10.2"/><path d="M8.5 16.5 12 6l3.5 10.5"/><path d="M10.2 11.5h3.6"/></svg>`,
  compose: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M18.4 3.6a1.9 1.9 0 0 1 2.7 2.7L12.5 15l-3.4.8.8-3.4z"/></svg>`,
};
const statusIcons = (battery) => `
  <svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx=".8" fill="${INK}"/><rect x="5" y="5.5" width="3.2" height="6.5" rx=".8" fill="${INK}"/><rect x="10" y="3" width="3.2" height="9" rx=".8" fill="${INK}"/><rect x="15" y="0" width="3.2" height="12" rx=".8" fill="${INK}"/></svg>
  <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 11.6 6.1 9.2a3.4 3.4 0 0 1 4.8 0z" fill="${INK}"/><path d="M3.7 6.8a6.8 6.8 0 0 1 9.6 0l-1.6 1.6a4.5 4.5 0 0 0-6.4 0z" fill="${INK}"/><path d="M1.2 4.3a10.4 10.4 0 0 1 14.6 0l-1.6 1.6a8.1 8.1 0 0 0-11.4 0z" fill="${INK}"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".6" y=".6" width="22.8" height="11.8" rx="3.6" fill="none" stroke="${INK}" stroke-opacity=".38" stroke-width="1.1"/><rect x="2.4" y="2.4" width="${(19.2 * battery).toFixed(1)}" height="8.2" rx="2.2" fill="${INK}"/><path d="M25 4.3v4.4a2.2 2.2 0 0 0 0-4.4z" fill="${INK}" fill-opacity=".4"/></svg>`;

const page = (note, shown) => `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  html,body{width:402px;height:${HEIGHT_PT}px;background:#fff;color:${INK};font-family:system-ui,-apple-system,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
  .status{position:absolute;top:0;left:0;right:0;height:54px}
  .time{position:absolute;left:52px;top:18px;font-weight:600;font-size:17px;line-height:22px;letter-spacing:-.2px}
  .icons{position:absolute;right:30px;top:23px;display:flex;gap:6px;align-items:center}
  .glass{position:absolute;top:59px;height:44px;border-radius:22px;background:rgba(255,255,255,.88);box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 2px 10px rgba(0,0,0,.10);display:flex;align-items:center;justify-content:center}
  .back{left:16px;width:44px}
  .actions{right:16px;width:100px;gap:30px}
  .note{position:absolute;top:126px;left:24px;right:24px;color:#333}
  h1{font-weight:700;font-size:28px;line-height:34px;letter-spacing:-.3px;margin-bottom:10px}
  p{font-weight:400;font-size:17px;line-height:26.5px;letter-spacing:-.4px;min-height:26.5px}
  .off{visibility:hidden}
  .toolbar{position:absolute;bottom:34px;height:48px;border-radius:24px;background:rgba(255,255,255,.88);box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 2px 12px rgba(0,0,0,.12);display:flex;align-items:center}
  .tools{left:16px;width:178px;justify-content:space-around;padding:0 10px}
  .compose{right:16px;width:48px;justify-content:center}
</style>
<div class="status"><div class="time">${note.time ?? "10:42"}</div><div class="icons">${statusIcons(note.battery ?? 0.72)}</div></div>
<div class="glass back">${icon.back}</div>
<div class="glass actions">${icon.share}${icon.more}</div>
<div class="note"><h1>${note.title}</h1>${note.lines.map((line, i) => `<p class="${i < shown ? "" : "off"}">${line}</p>`).join("")}</div>
<div class="toolbar tools">${icon.checklist}${icon.clip}${icon.pen}</div>
<div class="toolbar compose">${icon.compose}</div>`;

const words = (text) => text.split(/\s+/).filter(Boolean).length;

(async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "screens-"));
  const browser = await puppeteer.launch({ headless: "new" });
  const tab = await browser.newPage();
  await tab.setViewport({ width: 402, height: Math.ceil(HEIGHT_PT), deviceScaleFactor: PT });
  for (const [name, note] of Object.entries(notes)) {
    await tab.setContent(page(note, note.lines.length));
    // Reels' caption and buttons cover everything below 1250 px: the last line should end above it.
    const bottom = await tab.evaluate(() => document.querySelector(".note").getBoundingClientRect().bottom);
    const list = [];
    let total = 0;
    for (let shown = 0; shown <= note.lines.length; shown++) {
      // An empty line appears with the line after it.
      if (shown > 0 && shown < note.lines.length && note.lines[shown - 1] === "") continue;
      await tab.setContent(page(note, shown));
      const png = path.join(temp, `${name}-${shown}.png`);
      await tab.screenshot({ path: png, clip: { x: 0, y: 0, width: 402, height: HEIGHT_PT } });
      let hold = shown === 0 ? 0.8 : 0.4 + 0.17 * words(note.lines[shown - 1]);
      if (shown === note.lines.length) hold += 0.8;
      list.push(`file '${png}'\nduration ${hold.toFixed(2)}`);
      total += hold;
    }
    list.push(list[list.length - 1].split("\n")[0]);
    const listFile = path.join(temp, `${name}.txt`);
    writeFileSync(listFile, `${list.join("\n")}\n`);
    execFileSync(FFMPEG, ["-nostdin", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "scale=1080:1920,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-an", path.join(outDir, `${name}.mp4`)]);
    console.log(name, total.toFixed(2), `bottom ${Math.round(bottom * PT)}px`);
  }
  await browser.close();
  rmSync(temp, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
