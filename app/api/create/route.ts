// POST /api/create: one finished video. Waits until it is done. See lib/create.ts.
// Off in demo mode (lib/demo.ts): it needs the footage, ffmpeg and paid GMI calls.
import { createVideo, type CreateBody } from "@/lib/create";
import { DEMO_MODE } from "@/lib/demo";

export async function POST(request: Request) {
  if (DEMO_MODE) {
    return Response.json({ error: "Making videos is turned off in the demo. Use the Studio's Make a video button." }, { status: 403 });
  }
  try {
    const body = (await request.json()) as CreateBody;
    return Response.json(await createVideo(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("create:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
