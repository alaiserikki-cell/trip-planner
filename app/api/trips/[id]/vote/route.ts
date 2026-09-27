import { randomUUID } from "crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { advanceVoting, memberByToken, runGeneration } from "@/lib/engine";
import { auth, fail, type Ctx } from "@/lib/http";
import { getStore } from "@/lib/store";
import type { VoteChoice } from "@/lib/types";

export const maxDuration = 300;

const CHOICES: VoteChoice[] = ["in", "maybe", "out"];

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return fail("Invalid request");
  const store = getStore();
  const trip = await store.getTrip(id);
  if (!trip) return fail("Trip not found", 404);
  const me = memberByToken(await store.getMembers(id), auth(req).token);
  if (!me) return fail("Pick your name first.", 401);

  const option = (await store.getOptions(id)).find((o) => o.id === body.optionId);
  if (!option || option.round !== trip.round) return fail("That option isn't up for a vote.", 404);
  const choice = body.choice as VoteChoice;
  if (!CHOICES.includes(choice)) return fail("Pick I'm in, I'd go if needed, or I'm out.");
  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (choice === "out" && reason.length < 3) return fail("Say briefly why you're out, so the next round can fix it.");

  const existing = (await store.getVotes(id)).find((v) => v.optionId === option.id && v.memberId === me.id);
  const now = new Date().toISOString();

  if (trip.status === "voting" && trip.votingClosedRound < trip.round) {
    await store.upsertVote({ tripId: id, optionId: option.id, memberId: me.id, round: trip.round, choice, reason, updatedAt: now });
    after(async () => {
      const next = await advanceVoting(id);
      if (next) await runGeneration(id, next, ["voting"]);
    });
    return NextResponse.json({ ok: true });
  }

  if (trip.status === "deciding") {
    // Voting is closed: votes are locked. A change needs a reason and is shown to everyone.
    if (!existing) return fail("Voting has closed for this round.", 409);
    if (existing.choice === choice && existing.reason === reason) return NextResponse.json({ ok: true });
    const changeReason = String(body.changeReason ?? "").trim().slice(0, 300);
    if (changeReason.length < 3) return fail("Voting has closed, so changing your vote needs a reason. The group will see it.");
    await store.upsertVote({ ...existing, choice, reason, updatedAt: now });
    await store.addVoteChange({
      id: randomUUID(), tripId: id, optionId: option.id, memberId: me.id,
      fromChoice: existing.choice, toChoice: choice, reason: changeReason, createdAt: now,
    });
    return NextResponse.json({ ok: true });
  }

  return fail("Voting isn't open right now.", 409);
}
