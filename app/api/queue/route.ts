// GET /api/queue: the posts planned for each account, from clips/queue.json (local, never in git).
// POST {id, decision, note}: saves a review decision to the same file.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CLIPS_DIR } from "@/lib/library";

const FILE = path.join(CLIPS_DIR, "queue.json");

export interface QueuePost {
  id: string;
  /** Planned slot, e.g. "Sat Nov 7, 12:00 PM ET". */
  slot: string;
  account: string;
  platforms: string[];
  videoUrl: string;
  caption: string;
  /** Why this post is in the plan. */
  why: string;
  decision: "pending" | "approved" | "hold";
  note?: string;
}

async function load(): Promise<QueuePost[]> {
  return JSON.parse(await readFile(FILE, "utf8").catch(() => "[]"));
}

export async function GET() {
  return Response.json(await load());
}

export async function POST(request: Request) {
  const { id, decision, note } = await request.json();
  const posts = await load();
  const post = posts.find((item) => item.id === id);
  if (!post) return Response.json({ error: "No such post" }, { status: 404 });
  if (decision) post.decision = decision;
  if (note !== undefined) post.note = note;
  await writeFile(FILE, JSON.stringify(posts, null, 2));
  return Response.json(post);
}
