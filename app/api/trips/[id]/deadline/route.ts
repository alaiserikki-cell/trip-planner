import { NextRequest, NextResponse, after } from "next/server";
import { runGeneration } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

export const maxDuration = 300;

// Organiser only, once the deadline has passed with people missing:
// extend by 24 hours, or go ahead with whoever submitted.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can do that.", 403);
  if (trip.status !== "collecting") return fail("Options are already being generated.", 409);
  if (Date.now() < new Date(trip.deadline).getTime()) return fail("The deadline hasn't passed yet.", 409);

  if (body?.action === "extend") {
    const base = Math.max(Date.now(), new Date(trip.deadline).getTime());
    await store.updateTrip(id, { deadline: new Date(base + 24 * 3_600_000).toISOString() });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "proceed") {
    const submitted = (await store.getMembers(id)).filter((m) => m.submittedAt).length;
    if (submitted < 2) return fail("At least 2 people need to submit before options can be generated.", 409);
    after(() => runGeneration(id, 1, ["collecting"]));
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action");
}
