// GET /api/queue: the posts planned for each account, from clips/queue.json (local, never in git).
// Ben reviews in chat; Claude records his calls in that file, and the posting session adds a note per post.
import { readFile } from "node:fs/promises";
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
  decision: "pending" | "approved";
  /** Set when it goes out, e.g. "scheduled for Sat Nov 7, 12:00 PM ET from phone, sound: ...". */
  note?: string;
}

export async function GET() {
  return Response.json(JSON.parse(await readFile(FILE, "utf8").catch(() => "[]")) as QueuePost[]);
}
