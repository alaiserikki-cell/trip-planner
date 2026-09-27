import { NextRequest, NextResponse, after } from "next/server";
import { advanceVoting, runGeneration } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

export const maxDuration = 300;

// Organiser only: close voting without waiting for stragglers.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const trip = await getStore().getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can do that.", 403);
  if (trip.status !== "voting") return fail("Voting isn't open.", 409);
  const next = await advanceVoting(id, true);
  if (next) after(() => runGeneration(id, next, ["voting"]));
  return NextResponse.json({ ok: true });
}
