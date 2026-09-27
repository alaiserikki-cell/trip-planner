import { NextRequest, NextResponse } from "next/server";
import { buildChecklist } from "@/lib/constraints";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can lock the trip.", 403);
  if (trip.status !== "deciding") return fail("The trip can be locked once voting has closed.", 409);

  const option = (await store.getOptions(id)).find((o) => o.id === body?.optionId && o.round === trip.round);
  if (!option) return fail("That option isn't in the current round.", 404);

  const [members, votes] = await Promise.all([store.getMembers(id), store.getVotes(id)]);
  const optionVotes = votes.filter((v) => v.optionId === option.id);
  const leftOutIds = optionVotes.filter((v) => v.choice === "out").map((v) => v.memberId);
  if (leftOutIds.length && body?.confirmLeftOut !== true) {
    const names = members.filter((m) => leftOutIds.includes(m.id)).map((m) => m.name);
    return fail("Some people voted I'm out on this option.", 409, { needsConfirm: true, leftOut: names });
  }

  const lock = {
    tripId: id,
    optionId: option.id,
    inMemberIds: optionVotes.filter((v) => v.choice !== "out").map((v) => v.memberId),
    leftOutIds,
    checklist: buildChecklist(option),
    lockedAt: new Date().toISOString(),
  };
  const ok = await store.updateTripIf(id, ["deciding"], { status: "locked" });
  if (!ok) return fail("The trip was already locked.", 409);
  await store.saveLock(lock);
  return NextResponse.json({ ok: true });
}
