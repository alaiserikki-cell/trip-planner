import { NextRequest, NextResponse } from "next/server";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

// Organiser only: free up a name so that person can open the link on a new phone.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  if (auth(req).organiserKey !== trip.organiserKey) return fail("Only the organiser can do that.", 403);
  const member = (await store.getMembers(id)).find((m) => m.id === body?.memberId);
  if (!member) return fail("That name isn't on this trip.", 404);
  await store.updateMember(member.id, { deviceToken: null });
  return NextResponse.json({ ok: true });
}
