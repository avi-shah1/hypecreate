import example from "@/fixtures/format-brief.example.json";

// Avi: replace with the real search (lib/oriane.ts). It must keep returning
// FormatBrief[]. Until then the UI and Ben's half run on this real example.
export async function POST() {
  return Response.json(example);
}
