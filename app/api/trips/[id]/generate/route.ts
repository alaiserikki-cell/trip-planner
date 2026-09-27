import { NextRequest, NextResponse, after } from "next/server";
import { isGenerationStale, runGeneration } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

export const maxDuration = 300;

// Organiser only: retry a generation run that failed or got stuck.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can do that.", 403);
  if (!isGenerationStale(trip)) return fail("Options are still being generated.", 409);
  after(() => runGeneration(id, trip.round, ["generating"]));
  return NextResponse.json({ ok: true });
}
