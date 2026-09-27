import { NextRequest, NextResponse } from "next/server";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

// Organiser only: take a name off the list (a typo, a duplicate, someone who
// isn't coming). Only before they've answered and before options exist.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can do that.", 403);
  if (trip.status !== "collecting") return fail("Options have already been generated.", 409);

  const member = (await store.getMembers(id)).find((m) => m.id === body?.memberId);
  if (!member) return fail("That name isn't on this trip.", 404);
  if (member.isOrganiser) return fail("You can't remove yourself.", 409);
  if (member.submittedAt) return fail(`${member.name} has already answered, so they can't be removed.`, 409);

  await store.deleteMember(member.id);
  return NextResponse.json({ ok: true });
}
