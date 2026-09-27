import { NextRequest, NextResponse, after } from "next/server";
import { eachDate } from "@/lib/dates";
import { addLateAnswer, memberByToken, runPreview } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DEAL_BREAKERS,
  TRAVEL_MODES,
  TRIP_TYPES,
  type Preferences,
  type TravelMode,
  type TripType,
} from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return fail("Invalid request");
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  const members = await store.getMembers(id);
  const me = memberByToken(members, auth(req).token);
  if (!me) return fail("Pick your name first.", 401);
  // Before voting: answers can be edited freely. While voting is open: someone who
  // joined late can still send their answers once. After that: closed.
  const lateAnswer = trip.status === "voting" && trip.votingClosedRound < trip.round && !me.submittedAt;
  if (trip.status === "generating") return fail("The options are being planned right now. Try again in a minute.", 409);
  if (trip.status !== "collecting" && !lateAnswer) {
    return fail(me.submittedAt ? "Voting has started, so answers are locked in." : "Voting has closed for this trip.", 409);
  }

  const startingCity = String(body.startingCity ?? "").trim().slice(0, 60);
  if (!startingCity) return fail("Add your starting city.");

  const window = new Set(eachDate(trip.windowStart, trip.windowEnd));
  const dates: Preferences["dates"] = {};
  for (const [d, mark] of Object.entries(body.dates ?? {})) {
    if (window.has(d) && (mark === "available" || mark === "maybe")) dates[d] = mark;
  }

  const budget = Math.round(Number(body.budget) / 500) * 500;
  if (!Number.isFinite(budget) || budget < BUDGET_MIN || budget > BUDGET_MAX) return fail("Set your budget.");
  const firmness = body.firmness === "hard" ? "hard" : body.firmness === "stretch" ? "stretch" : null;
  if (!firmness) return fail("Say how firm your budget is.");

  const tripTypes = (Array.isArray(body.tripTypes) ? body.tripTypes : []).filter((t: string): t is TripType =>
    (TRIP_TYPES as readonly string[]).includes(t)
  );
  if (!tripTypes.length || tripTypes.length > 3) return fail("Pick 1 to 3 trip types.");
  const travelModes = (Array.isArray(body.travelModes) ? body.travelModes : []).filter((t: string): t is TravelMode =>
    (TRAVEL_MODES as readonly string[]).includes(t)
  );
  if (!travelModes.length) return fail("Pick at least one way to travel.");
  const dealBreakers = (Array.isArray(body.dealBreakers) ? body.dealBreakers : []).filter((t: string) =>
    (DEAL_BREAKERS as readonly string[]).includes(t)
  );

  const prefs: Preferences = {
    memberId: me.id,
    tripId: id,
    startingCity,
    dates,
    budget,
    firmness,
    tripTypes: Array.from(new Set<TripType>(tripTypes)),
    travelModes: Array.from(new Set<TravelMode>(travelModes)),
    dealBreakers,
    dealBreakerOther: String(body.dealBreakerOther ?? "").trim().slice(0, 200),
    anonymousDealBreakers: body.anonymousDealBreakers === true,
    fitPrivate: body.fitPrivate === true,
    greatTrip: String(body.greatTrip ?? "").trim().slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  await store.upsertPreferences(prefs);
  if (!me.submittedAt) {
    me.submittedAt = prefs.updatedAt;
    await store.updateMember(me.id, { submittedAt: prefs.updatedAt });
  }

  if (lateAnswer) await addLateAnswer(id);
  else after(() => runPreview(id)); // refresh the early look with this answer
  return NextResponse.json({ ok: true });
}
