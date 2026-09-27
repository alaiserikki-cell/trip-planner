import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";

// A friend opens the shared link and types their name. That name is then tied
// to their device, so only they can open (or change) their private answers.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!name) return fail("Type your name.");

  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  const members = await store.getMembers(id);
  const token = auth(req).token;

  // Same name as someone already on the trip.
  const existing = members.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    // Back on the same phone: just let them in.
    if (existing.deviceToken && existing.deviceToken === token) {
      return NextResponse.json({ memberId: existing.id, token });
    }
    // Added by name but never opened the link yet: this is them.
    if (!existing.deviceToken) {
      const next = randomUUID();
      await store.updateMember(existing.id, { deviceToken: next });
      return NextResponse.json({ memberId: existing.id, token: next });
    }
    return fail(
      `Someone has already joined as ${existing.name}. If that's you on a new phone, ask the organiser to reset it. Otherwise add your surname.`,
      409
    );
  }

  if (trip.status === "locked") return fail("This trip is already locked, so it isn't taking new people.", 409);

  const next = randomUUID();
  const member = {
    id: randomUUID(),
    tripId: id,
    name,
    position: Math.max(-1, ...members.map((m) => m.position)) + 1,
    isOrganiser: false,
    deviceToken: next,
    submittedAt: null,
  };
  await store.addMember(member);
  return NextResponse.json({ memberId: member.id, token: next });
}
