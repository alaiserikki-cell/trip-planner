import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { getStore } from "@/lib/store";
import type { MyTrip } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "My trips": a summary of each trip this device has joined or created. There are
// no accounts, so the browser sends the device tokens it holds and only trips it
// can prove it belongs to come back.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const entries: { id: string; token?: string | null; organiserKey?: string | null }[] = Array.isArray(body?.trips)
    ? body.trips.slice(0, 50)
    : [];
  if (!entries.length) return NextResponse.json({ trips: [] });

  const store = getStore();
  const results = await Promise.all(
    entries.map(async (e): Promise<MyTrip | null> => {
      if (typeof e?.id !== "string" || !UUID_RE.test(e.id)) return null;
      const [trip, members, lock] = await Promise.all([store.getTrip(e.id), store.getMembers(e.id), store.getLock(e.id)]);
      if (!trip) return null;
      const me = e.token ? members.find((m) => m.deviceToken && m.deviceToken === e.token) ?? null : null;
      const isOrganiser = !!e.organiserKey && e.organiserKey === trip.organiserKey;
      if (!me && !isOrganiser) return null;

      let locked: MyTrip["locked"] = null;
      if (lock) {
        const option = (await store.getOptions(e.id)).find((o) => o.id === lock.optionId);
        if (option) locked = { destination: option.destination, startDate: option.startDate, endDate: option.endDate };
      }
      return {
        id: trip.id,
        name: trip.name,
        status: trip.status,
        createdAt: trip.createdAt,
        deadline: trip.deadline,
        windowStart: trip.windowStart,
        windowEnd: trip.windowEnd,
        myName: me?.name ?? null,
        isOrganiser,
        people: members.length,
        answered: members.filter((m) => m.submittedAt).length,
        locked,
      };
    })
  ).catch(() => null);

  if (!results) return fail("Couldn't load your trips. Try again.", 500);
  const trips = results.filter((t): t is MyTrip => !!t).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ trips });
}
