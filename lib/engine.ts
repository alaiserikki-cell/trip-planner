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
import { planOptions, toLibraryEntry, writeSummaries, type DraftOption, type Person } from "./planner";
import type { LibraryDestination } from "./places";
import { getStore } from "./store";
import type { Constraints, Member, Preferences, RoundView, Trip, TripOption, TripStatus, TripView, Vote } from "./types";
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

export const MIN_PEOPLE = 2; // for final options and voting
export const MIN_PREVIEW = 1; // trip ideas start from the very first answer

export function allSubmitted(members: Member[]): boolean {
  return members.every((m) => m.submittedAt);
}

/**
 * With open joining, "everyone who joined has answered" can't start voting on its
 * own: more friends may still be on their way. Voting starts when the organiser
 * says so (2+ answers) or at the deadline.
 */
export function canStartVoting(members: Member[]): boolean {
  return members.filter((m) => m.submittedAt).length >= MIN_PEOPLE;
}

/**
 * A friend who joined after the options were planned answers while voting is
 * open: add them to the voters and recompute everyone's fit for the current
 * options (code only, no replanning). Existing AI-written sentences are kept.
 */
export async function addLateAnswer(tripId: string): Promise<void> {
  const data = await loadTrip(tripId);
  if (!data || data.trip.status !== "voting") return;
  const { trip, members, prefs, constraints, options } = data;
  const store = getStore();
  const current = roundOptions(options, trip.round);
  const c = constraints.find((x) => x.round === trip.round);
  if (!c || !current.length) return;

  const participantIds = members.filter((m) => m.submittedAt && prefs.some((p) => p.memberId === m.id)).map((m) => m.id);
  await store.saveConstraints({
    ...c,
    participantIds,
    missingIds: members.filter((m) => !participantIds.includes(m.id)).map((m) => m.id),
  });

  const base = current.map(({ fits: _f, minFit: _min, avgFit: _avg, rank: _r, ...o }) => {
    void _f;
    void _min;
    void _avg;
    void _r;
    return o;
  });
  const refit = applyFits(base, members, prefs.filter((p) => participantIds.includes(p.memberId)));
  for (const o of refit) {
    const before = current.find((x) => x.id === o.id);
    const fits = o.fits.map((f) => {
      const old = before?.fits.find((x) => x.memberId === f.memberId);
      return old?.submitted && f.submitted ? { ...f, summary: old.summary } : f;
    });
    await store.updateOptionFits({ id: o.id, fits, minFit: o.minFit, avgFit: o.avgFit, rank: o.rank });
  }
}

// ---------- Generation ----------

export const PREVIEW_STALE_MS = 3 * 60_000;

/** Identifies exactly which answers a plan was built from. Changes when anyone submits or edits. */
export function previewKey(members: Member[], prefs: Preferences[]): string {
  return members
    .filter((m) => m.submittedAt)
    .map((m) => `${m.id}:${prefs.find((p) => p.memberId === m.id)?.updatedAt ?? ""}`)
    .sort()
    .join("|");
}

/** Constraints (code) → options (Gemini) → photos → fit scores and ranking. */
async function planRound(
  data: Loaded,
  round: number,
  { aiSummaries = true }: { aiSummaries?: boolean } = {}
): Promise<{ constraints: Constraints; options: TripOption[] }> {
  const { trip, members, prefs, options: existing, votes } = data;
  const constraints = computeConstraints(trip, members, prefs, round);
  if (!constraints.participantIds.length) throw new Error("Nobody has submitted preferences yet.");
  if (!constraints.windows.length) throw new Error("The travel window is shorter than the trip length.");

  const people: Person[] = constraints.participantIds.map((id) => ({
    member: members.find((m) => m.id === id)!,
    prefs: prefs.find((p) => p.memberId === id)!,
  }));
  const store = getStore();
  const library = await store.getLibrary().catch(() => [] as LibraryDestination[]);
  const { drafts, source } = await planOptions(
    {
      trip,
      constraints,
      people,
      missing: members.filter((m) => constraints.missingIds.includes(m.id)),
      previous:
        round > 1
          ? { options: existing.filter((o) => o.round === round - 1), votes: votes.filter((v) => v.round === round - 1) }
          : null,
    },
    library
  );
  // Remember what Gemini planned, so the fallback has more places when the quota runs out.
  if (source === "ai") await rememberDestinations(drafts, library);

  const photos = await Promise.all(drafts.map((d) => coverPhoto(d.photoQuery)));
  const base = drafts.map(({ photoQuery: _q, lat: _lat, lng: _lng, ...d }, i) => {
    void _q;
    void _lat;
    void _lng;
    return { ...d, id: randomUUID(), tripId: trip.id, round, photo: photos[i] };
  });
  const ranked = applyFits(base, members, people.map((p) => p.prefs));
  // Each AI call counts against the Gemini quota; early looks keep the template sentences.
  const options = aiSummaries ? await writeSummaries(ranked, people) : ranked;
  return { constraints, options };
}

async function rememberDestinations(drafts: DraftOption[], library: LibraryDestination[]): Promise<void> {
  const entries = drafts
    .map((d) => toLibraryEntry(d, library.find((l) => l.key === d.destination.trim().toLowerCase())))
    .filter((e): e is LibraryDestination => !!e);
  await getStore()
    .saveLibrary(entries)
    .catch((e) => console.error("[library] couldn't save destinations:", e));
}

/**
 * Turn the early look into round 1 without replanning. Fit is recomputed against
 * the current member list.
 */
async function promotePreview(data: Loaded, preview: TripOption[]): Promise<{ constraints: Constraints; options: TripOption[] }> {
  const { trip, members, prefs } = data;
  const constraints = computeConstraints(trip, members, prefs, 1);
  const participantPrefs = prefs.filter((p) => constraints.participantIds.includes(p.memberId));
  const base = preview.map(({ fits: _f, minFit: _min, avgFit: _avg, rank: _r, ...o }) => {
    void _f;
    void _min;
    void _avg;
    void _r;
    return { ...o, id: randomUUID(), round: 1 };
  });
  // One Gemini call for the final, AI-written fit sentences (no replanning).
  const people: Person[] = constraints.participantIds.map((id) => ({
    member: members.find((m) => m.id === id)!,
    prefs: prefs.find((p) => p.memberId === id)!,
  }));
  const options = await writeSummaries(applyFits(base, members, participantPrefs), people);
  return { constraints, options };
}

/**
 * Final options for a round, then open voting. `expected` guards against double starts.
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
    const { trip, members, prefs, options: existing } = data;
    if (existing.some((o) => o.round === round)) {
      await store.updateTrip(tripId, { status: "voting" });
      return;
    }

    const preview = existing.filter((o) => o.round === 0);
    const upToDate = round === 1 && preview.length > 0 && trip.previewKey === previewKey(members, prefs);
    const { constraints, options } = upToDate ? await promotePreview(data, preview) : await planRound(data, round);

    await store.saveConstraints(constraints);
    await store.saveOptions(options);
    if (round === 1) await store.deleteOptions(tripId, 0);
    await store.updateTrip(tripId, { status: "voting", generationError: null, previewStartedAt: null });
  } catch (e) {
    console.error("[generation] failed:", e);
    await store.updateTrip(tripId, {
      generationError: e instanceof Error ? e.message : "Something went wrong while generating options.",
    });
  }
}

/**
 * Early look: plan options from whoever has answered so far (from the first answer), and
 * replan whenever someone new answers or edits. Only one run at a time; a run
 * re-checks at the end and goes again if answers changed while it was working.
 */
export async function runPreview(tripId: string): Promise<void> {
  const store = getStore();
  for (let pass = 0; pass < 3; pass++) {
    const data = await loadTrip(tripId);
    if (!data || data.trip.status !== "collecting") return;
    const { members, prefs, trip } = data;
    if (members.filter((m) => m.submittedAt).length < MIN_PREVIEW) return;
    const key = previewKey(members, prefs);
    if (trip.previewKey === key) return;

    const now = new Date();
    const claimed = await store.claimPreview(tripId, now.toISOString(), new Date(now.getTime() - PREVIEW_STALE_MS).toISOString());
    if (!claimed) return; // another run is on it and will pick up these answers when it finishes

    try {
      const { constraints, options } = await planRound(data, 0, { aiSummaries: false });
      const fresh = await store.getTrip(tripId);
      if (!fresh || fresh.status !== "collecting") return; // final options took over meanwhile
      await store.deleteOptions(tripId, 0);
      await store.saveConstraints(constraints);
      await store.saveOptions(options);
      await store.updateTrip(tripId, { previewKey: key, previewStartedAt: null });
    } catch (e) {
      console.error("[preview] failed:", e);
      await store.updateTrip(tripId, { previewStartedAt: null });
      return;
    }
  }
}

export function needsPreview(data: Loaded): boolean {
  const { trip, members, prefs } = data;
  return (
    trip.status === "collecting" &&
    members.filter((m) => m.submittedAt).length >= MIN_PREVIEW &&
    trip.previewKey !== previewKey(members, prefs)
  );
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
    if (c.round === 0 && trip.status !== "collecting") continue;
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
    deadlinePassed: trip.status === "collecting" && now > new Date(trip.deadline),
    generationStale: isGenerationStale(trip, now.getTime()),
    previewUpdating: needsPreview(data),
    rounds,
    cleanOptionIds: clean.map((o) => o.id),
    blocker,
    lock,
    now: now.toISOString(),
  };
}

