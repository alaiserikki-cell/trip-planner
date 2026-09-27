import { randomUUID } from "crypto";
import {
  applyFits,
  computeConstraints,
  diagnoseBlocker,
  exclusionLine,
  mostSupported,
  optionStats,
  optionsWithoutOuts,
  unmetConstraints,
} from "./constraints";
import { planOptions, writeSummaries, type Person } from "./planner";
import { getStore } from "./store";
import type { Member, RoundView, Trip, TripOption, TripStatus, TripView, Vote } from "./types";
import { coverPhoto } from "./unsplash";

export const GENERATION_STALE_MS = 4 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadTrip(tripId: string) {
  // A mangled link would otherwise reach Postgres as an invalid uuid and 500.
  if (!UUID_RE.test(tripId)) return null;
  const store = getStore();
  // One round trip: fetch everything at once rather than the trip first.
  const [trip, members, prefs, constraints, options, votes, changes, lock] = await Promise.all([
    store.getTrip(tripId),
    store.getMembers(tripId),
    store.getPreferences(tripId),
    store.getConstraints(tripId),
    store.getOptions(tripId),
    store.getVotes(tripId),
    store.getVoteChanges(tripId),
    store.getLock(tripId),
  ]);
  if (!trip) return null;
  return { trip, members, prefs, constraints, options, votes, changes, lock };
}

export type Loaded = NonNullable<Awaited<ReturnType<typeof loadTrip>>>;

export function memberByToken(members: Member[], token: string | null): Member | null {
  if (!token) return null;
  return members.find((m) => m.deviceToken && m.deviceToken === token) ?? null;
}

export const MIN_PEOPLE = 3;
export const MAX_PEOPLE = 8;

export function allSubmitted(members: Member[]): boolean {
  return members.every((m) => m.submittedAt);
}

/**
 * Friends can add themselves from the link, so "everyone has submitted" only
 * means something once enough people have joined. Below that, wait for the
 * deadline and let the organiser decide.
 */
export function readyToGenerate(members: Member[]): boolean {
  return members.length >= MIN_PEOPLE && allSubmitted(members);
}

// ---------- Generation ----------

/**
 * Compute constraints (code), ask the planner for options (Gemini), attach photos
 * and fit scores, then open voting. `expected` guards against double starts.
 */
export async function runGeneration(tripId: string, round: number, expected: TripStatus[]): Promise<void> {
  const store = getStore();
  const claimed = await store.updateTripIf(tripId, expected, {
    status: "generating",
    round,
    generationStartedAt: new Date().toISOString(),
    generationError: null,
  });
  if (!claimed) return;

  try {
    const data = await loadTrip(tripId);
    if (!data) return;
    const { trip, members, prefs, options: existing, votes } = data;
    if (existing.some((o) => o.round === round)) {
      await store.updateTrip(tripId, { status: "voting" });
      return;
    }

    const constraints = computeConstraints(trip, members, prefs, round);
    if (!constraints.participantIds.length) throw new Error("Nobody has submitted preferences yet.");
    if (!constraints.windows.length) throw new Error("The travel window is shorter than the trip length.");
    await store.saveConstraints(constraints);

    const people: Person[] = constraints.participantIds.map((id) => ({
      member: members.find((m) => m.id === id)!,
      prefs: prefs.find((p) => p.memberId === id)!,
    }));
    const prevOptions = existing.filter((o) => o.round === round - 1);
    const drafts = await planOptions({
      trip,
      constraints,
      people,
      missing: members.filter((m) => constraints.missingIds.includes(m.id)),
      previous: round > 1 ? { options: prevOptions, votes: votes.filter((v) => v.round === round - 1) } : null,
    });

    const photos = await Promise.all(drafts.map((d) => coverPhoto(d.photoQuery)));
    const base = drafts.map(({ photoQuery: _q, ...d }, i) => {
      void _q;
      return { ...d, id: randomUUID(), tripId, round, photo: photos[i] };
    });
    const participantPrefs = people.map((p) => p.prefs);
    const ranked = await writeSummaries(applyFits(base, members, participantPrefs), people);

    await store.saveOptions(ranked);
    await store.updateTrip(tripId, { status: "voting", generationError: null });
  } catch (e) {
    console.error("[generation] failed:", e);
    await store.updateTrip(tripId, {
      generationError: e instanceof Error ? e.message : "Something went wrong while generating options.",
    });
  }
}

export function isGenerationStale(trip: Trip, now = Date.now()): boolean {
  if (trip.status !== "generating") return false;
  if (trip.generationError) return true;
  return !trip.generationStartedAt || now - new Date(trip.generationStartedAt).getTime() > GENERATION_STALE_MS;
}

// ---------- Voting ----------

export function roundOptions(options: TripOption[], round: number) {
  return options.filter((o) => o.round === round);
}

export function everyoneVoted(options: TripOption[], votes: Vote[], participantIds: string[]): boolean {
  return participantIds.every((id) => options.every((o) => votes.some((v) => v.optionId === o.id && v.memberId === id)));
}

/**
 * Close voting when every participant has voted on every option (or the organiser
 * forces it). Returns the next round number if a new round should be generated.
 */
export async function advanceVoting(tripId: string, force = false): Promise<number | null> {
  const data = await loadTrip(tripId);
  if (!data || data.trip.status !== "voting") return null;
  const { trip, options, votes, constraints } = data;
  const round = trip.round;
  const opts = roundOptions(options, round);
  const participants = constraints.find((c) => c.round === round)?.participantIds ?? [];
  const roundVotes = votes.filter((v) => v.round === round);
  if (!force && !everyoneVoted(opts, roundVotes, participants)) return null;

  const store = getStore();
  const clean = optionsWithoutOuts(opts, roundVotes);
  if (clean.length || round >= 2) {
    await store.updateTripIf(tripId, ["voting"], { status: "deciding", votingClosedRound: round });
    return null;
  }
  await store.updateTrip(tripId, { votingClosedRound: round });
  return round + 1;
}

// ---------- What each viewer is allowed to see ----------

export function buildView(data: Loaded, viewerToken: string | null, organiserKey: string | null): TripView {
  const { trip, members, prefs, constraints, options, votes, changes, lock } = data;
  const now = new Date();
  const me = memberByToken(members, viewerToken);
  const isOrganiser = !!organiserKey && organiserKey === trip.organiserKey;

  const current = roundOptions(options, trip.round);
  const currentVotes = votes.filter((v) => v.round === trip.round);

  // People who chose to keep their fit private: everyone else sees a placeholder row.
  const privateIds = prefs.filter((p) => p.fitPrivate).map((p) => p.memberId);
  const hideFor = (o: TripOption): TripOption => ({
    ...o,
    fits: o.fits.map((f) =>
      privateIds.includes(f.memberId) && f.memberId !== me?.id
        ? { ...f, hidden: true, dates: "amber", budget: "amber", budgetLabel: "Stretch", tripType: "amber", travel: "amber", score: 0, summary: "" }
        : f
    ),
  });

  const rounds: RoundView[] = [];
  for (const c of constraints) {
    const opts = roundOptions(options, c.round);
    if (!opts.length) continue;
    const roundVotes = votes.filter((v) => v.round === c.round);
    const closed = trip.votingClosedRound >= c.round;
    const myVotes: RoundView["votes"]["myVotes"] = {};
    if (me) {
      for (const v of roundVotes.filter((v) => v.memberId === me.id)) myVotes[v.optionId] = { choice: v.choice, reason: v.reason };
    }
    rounds.push({
      round: c.round,
      options: opts.map(hideFor),
      stats: Object.fromEntries(opts.map((o) => [o.id, optionStats(o)])),
      exclusions: c.exclusions.map((x) => exclusionLine(x, (id) => members.find((m) => m.id === id)?.name ?? "Someone")),
      missingIds: c.missingIds,
      unmet: unmetConstraints(opts, members, privateIds),
      votes: {
        closed,
        participantIds: c.participantIds,
        finishedCount: c.participantIds.filter((id) => opts.every((o) => roundVotes.some((v) => v.optionId === o.id && v.memberId === id))).length,
        myVotes,
        // Votes stay private until voting closes.
        all: closed ? roundVotes.map((v) => ({ optionId: v.optionId, memberId: v.memberId, choice: v.choice, reason: v.reason })) : null,
      },
      changes: changes.filter((ch) => opts.some((o) => o.id === ch.optionId)),
    });
  }

  const deciding = trip.status === "deciding";
  const clean = deciding ? optionsWithoutOuts(current, currentVotes) : [];
  let blocker: TripView["blocker"] = null;
  if (deciding && !clean.length && trip.round >= 2) {
    const best = mostSupported(current, currentVotes);
    if (best) blocker = { optionId: best.id, lines: diagnoseBlocker(best, currentVotes, members, privateIds) };
  }

  const { organiserKey: _k, ...publicTrip } = trip;
  void _k;
  const myPrefs = me ? prefs.find((p) => p.memberId === me.id) ?? null : null;

  return {
    trip: publicTrip,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      isOrganiser: m.isOrganiser,
      submitted: !!m.submittedAt,
      claimed: !!m.deviceToken,
      votedAll: current.length > 0 && current.every((o) => currentVotes.some((v) => v.optionId === o.id && v.memberId === m.id)),
    })),
    me: me ? { memberId: me.id, name: me.name, preferences: myPrefs } : null,
    isOrganiser,
    deadlinePassed: trip.status === "collecting" && now > new Date(trip.deadline) && !readyToGenerate(members),
    generationStale: isGenerationStale(trip, now.getTime()),
    rounds,
    cleanOptionIds: clean.map((o) => o.id),
    blocker,
    lock,
    now: now.toISOString(),
  };
}

