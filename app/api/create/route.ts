// POST /api/create: one finished video. Waits until it is done. See lib/create.ts.
import { createVideo, type CreateBody } from "@/lib/create";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBody;
    return Response.json(await createVideo(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("create:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
