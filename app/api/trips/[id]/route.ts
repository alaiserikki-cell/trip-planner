import { NextRequest, NextResponse, after } from "next/server";
import { advanceVoting, buildView, loadTrip, needsPreview, runGeneration, runPreview } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";

export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const data = await loadTrip(id);
  if (!data) return fail("Trip not found", 404);
  const { token, organiserKey } = auth(req);

  // Self-heal: if a transition was missed (e.g. a background task died), nudge it along.
  // Both calls are guarded by compare-and-set on the trip status, so repeats are harmless.
  const { trip } = data;
  if (needsPreview(data)) {
    after(() => runPreview(id));
  } else if (trip.status === "voting") {
    after(async () => {
      const next = await advanceVoting(id);
      if (next) await runGeneration(id, next, ["voting"]);
    });
  }

  return NextResponse.json(buildView(data, token, organiserKey), { headers: { "Cache-Control": "no-store" } });
}
