import { NextRequest, NextResponse, after } from "next/server";
import { canStartVoting, runGeneration } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

export const maxDuration = 300;

// Organiser only: extend the deadline by 24 hours, or start voting now with
// whoever has answered (any time once 2+ have).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can do that.", 403);
  if (trip.status !== "collecting") return fail("Options are already being generated.", 409);

  if (body?.action === "extend") {
    const base = Math.max(Date.now(), new Date(trip.deadline).getTime());
    await store.updateTrip(id, { deadline: new Date(base + 24 * 3_600_000).toISOString() });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "proceed") {
    if (!canStartVoting(await store.getMembers(id))) return fail("At least 2 people need to answer before voting can start.", 409);
    after(() => runGeneration(id, 1, ["collecting"]));
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action");
}
