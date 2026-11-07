// The local clip library. clips/ is a symlink to footage that never enters git, and
// clips/library.json lists every clip with its tags. On a laptop without the footage,
// /api/create fails with a clear message and the rest of the app still works.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Clip } from "./contract";

export const CLIPS_DIR = path.join(process.cwd(), "clips");

export type LibraryClip = Clip & { description: string };

export async function loadLibrary(person?: string): Promise<LibraryClip[]> {
  let clips: LibraryClip[];
  try {
    clips = JSON.parse(await readFile(path.join(CLIPS_DIR, "library.json"), "utf8"));
  } catch {
    throw new Error("No clips/library.json on this machine: the footage is only on Ben's laptop.");
  }
  return clips.filter((clip) => {
    if (!clip.cleared) return false;
    // A faceless account uses whatever has nobody on camera: scenery, screens, hands.
    if (person === "faceless") return !clip.tags.includes("person");
    return !person || clip.person === person || clip.person === null;
  });
}

export function clipPath(clip: Pick<Clip, "file">): string {
  return path.join(CLIPS_DIR, clip.file);
}
