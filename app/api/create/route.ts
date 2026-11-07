// POST /api/create: one finished video from a format, or from a script written by hand.
// The script comes from the LLM unless the request brings its own (scripts/batch.mjs does).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CreateRequest, CreateResult, VideoStyle } from "@/lib/contract";
import { chat, generateClip, type GeneratedClip } from "@/lib/gmi";
import { clipPath, CLIPS_DIR, loadLibrary, type LibraryClip } from "@/lib/library";
import { renderVideo, type Scene } from "@/lib/render";

interface ScriptScene {
  /** A file from the clip library. */
  clip?: string;
  /** Or a description for AI generation. */
  prompt?: string;
  start?: number;
  seconds: number;
  text?: string;
}

interface Script {
  scenes: ScriptScene[];
  caption: string;
  /** What kind of sound to add in the app when posting. */
  sound?: string;
}

type Body = Partial<CreateRequest> & {
  person?: string;
  script?: Script;
  /** Output name and subfolder under public/renders. */
  slug?: string;
  folder?: string;
};

const LEGAL = {
  en: "No purchase necessary. STQ required. Rules & odds: lodavo.com/rules",
  fr: "Aucun achat requis. QH requise. Règles & chances : lodavo.com/regles",
};
const PRIZE_WORDS = /\b(prize|prizes|win|wins|winning|winner|winners|jackpot|cash draw|gagner|gagnant|prix)\b/i;

const STYLE_RULES: Record<VideoStyle, string> = {
  "hook-plus-demo":
    "First scene: a clip tagged reaction or hook, about 4 seconds, carrying the hook. Then 3 or 4 scenes from clips tagged app-demo, about 4 seconds each, each with one short line about what the app is doing on screen. The last line ends with 'Link in bio'. 16 to 22 seconds total.",
  "broll-text":
    "One clip tagged broll or selfie, exactly 7 seconds, carrying the hook and nothing else. The value goes in the caption, as a short numbered list.",
  "ai-generated":
    "One or two scenes, 6 seconds each. Instead of 'clip', give each scene a 'prompt': a detailed description of a realistic handheld vertical phone shot of objects, hands or places. An AI-generated scene never shows a person's face and never plays a real user. Scene 1 carries the hook; the value goes in the caption.",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const language = body.language ?? "en";
    const person = body.person ?? "chaerin";
    const library = await loadLibrary(person);
    const style = body.style ?? body.brief?.recommendedStyle ?? "hook-plus-demo";
    const script = body.script ?? (await writeScript(body, style, person, library));

    const clipsUsed: string[] = [];
    const scenes: Scene[] = [];
    let cost = 0;
    let showsPrizes = false;
    for (const scene of script.scenes) {
      if (scene.prompt) {
        const generated: GeneratedClip = await generateClip(scene.prompt, scene.seconds);
        cost += generated.costUsd;
        clipsUsed.push(`${generated.model}: ${scene.prompt.slice(0, 60)}`);
        scenes.push({ file: await saveGenerated(generated), seconds: scene.seconds, text: scene.text });
        continue;
      }
      const clip = pickClip(library, scene.clip, style, scenes.length === 0);
      const start = Math.max(0, Math.min(scene.start ?? 0, clip.seconds - 1));
      scenes.push({
        file: clipPath(clip),
        start,
        seconds: Math.min(scene.seconds, clip.seconds - start),
        text: scene.text,
      });
      clipsUsed.push(clip.file);
      showsPrizes ||= clip.tags.includes("prizes");
    }

    const words = script.scenes.map((scene) => scene.text ?? "").join(" ");
    const needsLegal = showsPrizes || PRIZE_WORDS.test(words);

    const name = body.slug ?? `${body.brief?.id ?? "video"}-${style}-${shortHash(JSON.stringify(script))}`;
    const relative = path.join(body.folder ?? "", `${name}.mp4`);
    const outFile = path.join(process.cwd(), "public", "renders", relative);
    await renderVideo(scenes, outFile, needsLegal ? LEGAL[language] : undefined);
    await writeFile(outFile.replace(/\.mp4$/, ".txt"), postingNotes(script, words));

    const result: CreateResult = {
      videoUrl: `/renders/${relative}`,
      caption: script.caption,
      script: words,
      style,
      clipsUsed,
      generationCostUsd: cost,
    };
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("create:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function writeScript(body: Body, style: VideoStyle, person: string, library: LibraryClip[]): Promise<Script> {
  if (!body.brief) throw new Error("Send a brief or a script.");
  const read = (file: string) => readFile(path.join(process.cwd(), "brand", file), "utf8").catch(() => "");
  const brandRules = await read(`${body.brand ?? "lodavo"}.md`);
  const approved = await read(`${person}-hooks.md`);
  const clips = library.map((clip) => `- ${clip.file} (${clip.seconds}s, ${clip.tags.join(", ")}): ${clip.description}`);

  const reply = await chat([
    {
      role: "system",
      content: `You script short vertical videos that remake a format that is working right now for a brand, using real clips. Follow the brand rules exactly.

${brandRules}

Rules for this video:
- Style: ${STYLE_RULES[style]}
- This video remakes the format below. Scene 1's text is the format's hook pattern with the blanks filled in for this brand's audience. Use an approved hook only if it has the same structure as the format's hook.
- Keep the format's beats: what each scene does, in the same order.
- On-screen lines are short and spoken-sounding, 9 words at most. A line must read in the seconds it holds: 1 second plus 0.3 seconds a word.
- Sell the fun. Never say how the bank connection works or where the savings stay.
- Never put legal text on screen or in the caption: the renderer adds the legal line.
- Only state facts in the brand rules. Do not invent a personal story, an age or a number about the person on screen: use a general voice, or a hook they approved.
- Reply with JSON only: {"scenes":[{"clip":"file from the list","start":0,"seconds":4,"text":"on-screen line"}],"caption":"post caption","sound":"the kind of sound to add when posting"}`,
    },
    {
      role: "user",
      content: `Language: ${body.language ?? "en"}

The format:
${JSON.stringify({ ...body.brief, evidence: body.brief.evidence.slice(0, 2) }, null, 1)}

Clips you can use:
${clips.join("\n")}
${approved ? `\nHooks the person on screen approved, if one fits:\n${approved}` : ""}`,
    },
  ]);
  const json = reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
  return JSON.parse(json) as Script;
}

/** Uses the clip the script named; if it named nothing usable, the best fit by tag. */
function pickClip(library: LibraryClip[], file: string | undefined, style: VideoStyle, isFirst: boolean): LibraryClip {
  const named = library.find((clip) => clip.file === file);
  if (named) return named;
  const wanted = style === "hook-plus-demo" ? (isFirst ? "reaction" : "app-demo") : "broll";
  const match = library.find((clip) => clip.tags.includes(wanted) && clip.seconds >= 4);
  if (!match) throw new Error(`No clip tagged ${wanted} in the library.`);
  return match;
}

async function saveGenerated(generated: GeneratedClip): Promise<string> {
  const dir = path.join(CLIPS_DIR, "generated");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${shortHash(generated.url)}.mp4`);
  const bytes = Buffer.from(await (await fetch(generated.url)).arrayBuffer());
  await writeFile(file, bytes);
  return file;
}

function postingNotes(script: Script, words: string): string {
  return `CAPTION\n${script.caption}\n\nON SCREEN\n${words}\n\nSOUND\n${script.sound ?? "Add a sound from the app's recommended list when posting."}\n`;
}

function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8);
}
