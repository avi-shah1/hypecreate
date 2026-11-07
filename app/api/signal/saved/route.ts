// GET /api/signal/saved: the searches with saved formats, for the studio's instant chips.
import { listSaved } from "../signal";

export async function GET() {
  return Response.json(await listSaved());
}
