import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { daysBetween, todayISO } from "@/lib/dates";
import { fail } from "@/lib/http";
import { getStore } from "@/lib/store";
import { TRIP_LENGTHS, type Member, type Trip, type TripLength } from "@/lib/types";

const MIN_DAYS: Record<TripLength, number> = { "2-3": 2, "4-5": 4, "6+": 6 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Invalid request");

  const name = String(body.name ?? "").trim().slice(0, 60);
  const organiserName = String(body.organiserName ?? "").trim().slice(0, 30);
  const friends: string[] = Array.isArray(body.friends)
    ? body.friends.map((f: unknown) => String(f).trim().slice(0, 30)).filter(Boolean)
    : [];
  const { windowStart, windowEnd, tripLength } = body;

  if (!name) return fail("Give the trip a name.");
  if (!organiserName) return fail("Add your own name.");
  const everyone = [organiserName, ...friends];
  if (new Set(everyone.map((n) => n.toLowerCase())).size !== everyone.length) return fail("Every name needs to be different.");
  if (!TRIP_LENGTHS.includes(tripLength)) return fail("Pick a trip length.");
  if (!DATE_RE.test(windowStart ?? "") || !DATE_RE.test(windowEnd ?? "")) return fail("Pick the travel window.");
  if (windowStart < todayISO()) return fail("The travel window can't start in the past.");
  if (daysBetween(windowStart, windowEnd) + 1 < MIN_DAYS[tripLength as TripLength]) return fail("The travel window is shorter than the trip.");
  if (daysBetween(windowStart, windowEnd) > 200) return fail("Keep the travel window under about 6 months.");

  const now = new Date();
  let deadline = body.deadline ? new Date(body.deadline) : new Date(now.getTime() + 48 * 3_600_000);
  if (Number.isNaN(deadline.getTime()) || deadline <= now) return fail("The deadline needs to be in the future.");
  // No point collecting answers after the trip could have started.
  const latest = new Date(`${windowStart}T00:00:00+05:30`);
  if (deadline > latest && latest > now) deadline = latest;

  const trip: Trip = {
    id: randomUUID(),
    name,
    windowStart,
    windowEnd,
    tripLength,
    deadline: deadline.toISOString(),
    status: "collecting",
    round: 1,
    organiserKey: randomUUID(),
    generationStartedAt: null,
    generationError: null,
    votingClosedRound: 0,
    previewStartedAt: null,
    previewKey: null,
    createdAt: now.toISOString(),
  };
  const token = randomUUID();
  const members: Member[] = everyone.map((n, i) => ({
    id: randomUUID(),
    tripId: trip.id,
    name: n,
    position: i,
    isOrganiser: i === 0,
    deviceToken: i === 0 ? token : null,
    submittedAt: null,
  }));

  await getStore().createTrip(trip, members);
  return NextResponse.json({ tripId: trip.id, organiserKey: trip.organiserKey, memberId: members[0].id, token });
}
