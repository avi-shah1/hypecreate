// GET /api/renders: every finished video on this machine, grouped by account.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const RENDERS = path.join(process.cwd(), "public", "renders");

export async function GET() {
  const groups: { account: string; videos: { url: string; notes: string }[] }[] = [];
  const entries = await readdir(RENDERS, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const files = (await readdir(path.join(RENDERS, entry.name))).filter((file) => file.endsWith(".mp4")).sort();
    const videos = await Promise.all(
      files.map(async (file) => ({
        url: `/renders/${entry.name}/${file}`,
        notes: await readFile(path.join(RENDERS, entry.name, file.replace(/\.mp4$/, ".txt")), "utf8").catch(() => ""),
      })),
    );
    groups.push({ account: entry.name, videos });
  }
  return Response.json(groups);
}
