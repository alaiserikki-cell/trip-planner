import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Constraints, Exclusion, Member, Preferences, Trip, TripLock, TripOption, TripStatus, Vote, VoteChange } from "./types";

export interface Store {
  createTrip(trip: Trip, members: Member[]): Promise<void>;
  getTrip(id: string): Promise<Trip | null>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<void>;
  /** Compare-and-set on status, so two requests can't both start generating. */
  updateTripIf(id: string, expected: TripStatus[], patch: Partial<Trip>): Promise<boolean>;
  getMembers(tripId: string): Promise<Member[]>;
  updateMember(id: string, patch: Partial<Member>): Promise<void>;
  addMember(m: Member): Promise<void>;
  deleteMember(id: string): Promise<void>;
  getPreferences(tripId: string): Promise<Preferences[]>;
  upsertPreferences(p: Preferences): Promise<void>;
  /** Privacy can change at any time, even after preferences are frozen. */
  setFitPrivate(memberId: string, value: boolean): Promise<void>;
  saveConstraints(c: Constraints): Promise<void>;
  getConstraints(tripId: string): Promise<Constraints[]>;
  saveOptions(options: TripOption[]): Promise<void>;
  getOptions(tripId: string): Promise<TripOption[]>;
  getVotes(tripId: string): Promise<Vote[]>;
  upsertVote(v: Vote): Promise<void>;
  addVoteChange(c: VoteChange): Promise<void>;
  getVoteChanges(tripId: string): Promise<VoteChange[]>;
  saveLock(l: TripLock): Promise<void>;
  getLock(tripId: string): Promise<TripLock | null>;
}

// ---------- In-memory (used when Supabase env vars are absent) ----------

interface MemDb {
  trips: Map<string, Trip>;
  members: Member[];
  prefs: Preferences[];
  constraints: Constraints[];
  options: TripOption[];
  votes: Vote[];
  changes: VoteChange[];
  locks: TripLock[];
}

const clone = <T>(x: T): T => structuredClone(x);

class MemoryStore implements Store {
  constructor(private db: MemDb) {}

  async createTrip(trip: Trip, members: Member[]) {
    this.db.trips.set(trip.id, clone(trip));
    this.db.members.push(...clone(members));
  }
  async getTrip(id: string) {
    const t = this.db.trips.get(id);
    return t ? clone(t) : null;
  }
  async updateTrip(id: string, patch: Partial<Trip>) {
    const t = this.db.trips.get(id);
    if (t) Object.assign(t, patch);
  }
  async updateTripIf(id: string, expected: TripStatus[], patch: Partial<Trip>) {
    const t = this.db.trips.get(id);
    if (!t || !expected.includes(t.status)) return false;
    Object.assign(t, patch);
    return true;
  }
  async getMembers(tripId: string) {
    return clone(this.db.members.filter((m) => m.tripId === tripId).sort((a, b) => a.position - b.position));
  }
  async updateMember(id: string, patch: Partial<Member>) {
    const m = this.db.members.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  }
  async addMember(m: Member) {
    this.db.members.push(clone(m));
  }
  async deleteMember(id: string) {
    this.db.members = this.db.members.filter((m) => m.id !== id);
    this.db.prefs = this.db.prefs.filter((p) => p.memberId !== id);
  }
  async getPreferences(tripId: string) {
    return clone(this.db.prefs.filter((p) => p.tripId === tripId));
  }
  async upsertPreferences(p: Preferences) {
    this.db.prefs = this.db.prefs.filter((x) => x.memberId !== p.memberId);
    this.db.prefs.push(clone(p));
  }
  async setFitPrivate(memberId: string, value: boolean) {
    const p = this.db.prefs.find((x) => x.memberId === memberId);
    if (p) p.fitPrivate = value;
  }
  async saveConstraints(c: Constraints) {
    this.db.constraints = this.db.constraints.filter((x) => !(x.tripId === c.tripId && x.round === c.round));
    this.db.constraints.push(clone(c));
  }
  async getConstraints(tripId: string) {
    return clone(this.db.constraints.filter((c) => c.tripId === tripId).sort((a, b) => a.round - b.round));
  }
  async saveOptions(options: TripOption[]) {
    this.db.options.push(...clone(options));
  }
  async getOptions(tripId: string) {
    return clone(this.db.options.filter((o) => o.tripId === tripId).sort((a, b) => a.round - b.round || a.rank - b.rank));
  }
  async getVotes(tripId: string) {
    return clone(this.db.votes.filter((v) => v.tripId === tripId));
  }
  async upsertVote(v: Vote) {
    this.db.votes = this.db.votes.filter((x) => !(x.optionId === v.optionId && x.memberId === v.memberId));
    this.db.votes.push(clone(v));
  }
  async addVoteChange(c: VoteChange) {
    this.db.changes.push(clone(c));
  }
  async getVoteChanges(tripId: string) {
    return clone(this.db.changes.filter((c) => c.tripId === tripId));
  }
  async saveLock(l: TripLock) {
    this.db.locks = this.db.locks.filter((x) => x.tripId !== l.tripId);
    this.db.locks.push(clone(l));
  }
  async getLock(tripId: string) {
    const l = this.db.locks.find((x) => x.tripId === tripId);
    return l ? clone(l) : null;
  }
}

// ---------- Supabase ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const tripToRow = (t: Partial<Trip>): Row => {
  const map: Record<keyof Trip, string> = {
    id: "id", name: "name", windowStart: "window_start", windowEnd: "window_end", tripLength: "trip_length",
    deadline: "deadline", status: "status", round: "round", organiserKey: "organiser_key",
    generationStartedAt: "generation_started_at", generationError: "generation_error",
    votingClosedRound: "voting_closed_round", createdAt: "created_at",
  };
  const row: Row = {};
  for (const [k, v] of Object.entries(t)) row[map[k as keyof Trip]] = v;
  return row;
};

const rowToTrip = (r: Row): Trip => ({
  id: r.id, name: r.name, windowStart: r.window_start, windowEnd: r.window_end, tripLength: r.trip_length,
  deadline: r.deadline, status: r.status, round: r.round, organiserKey: r.organiser_key,
  generationStartedAt: r.generation_started_at, generationError: r.generation_error,
  votingClosedRound: r.voting_closed_round, createdAt: r.created_at,
});

const memberToRow = (m: Partial<Member>): Row => {
  const row: Row = {};
  if (m.id !== undefined) row.id = m.id;
  if (m.tripId !== undefined) row.trip_id = m.tripId;
  if (m.name !== undefined) row.name = m.name;
  if (m.position !== undefined) row.position = m.position;
  if (m.isOrganiser !== undefined) row.is_organiser = m.isOrganiser;
  if (m.deviceToken !== undefined) row.device_token = m.deviceToken;
  if (m.submittedAt !== undefined) row.submitted_at = m.submittedAt;
  return row;
};

const rowToMember = (r: Row): Member => ({
  id: r.id, tripId: r.trip_id, name: r.name, position: r.position, isOrganiser: r.is_organiser,
  deviceToken: r.device_token, submittedAt: r.submitted_at,
});

class SupabaseStore implements Store {
  constructor(private sb: SupabaseClient) {}

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`Database error: ${res.error.message}`);
    return res.data;
  }

  async createTrip(trip: Trip, members: Member[]) {
    this.check(await this.sb.from("trips").insert(tripToRow(trip)));
    this.check(await this.sb.from("trip_members").insert(members.map(memberToRow)));
  }
  async getTrip(id: string) {
    const data = this.check(await this.sb.from("trips").select("*").eq("id", id).maybeSingle());
    return data ? rowToTrip(data) : null;
  }
  async updateTrip(id: string, patch: Partial<Trip>) {
    this.check(await this.sb.from("trips").update(tripToRow(patch)).eq("id", id));
  }
  async updateTripIf(id: string, expected: TripStatus[], patch: Partial<Trip>) {
    const data = this.check(
      await this.sb.from("trips").update(tripToRow(patch)).eq("id", id).in("status", expected).select("id")
    );
    return (data?.length ?? 0) > 0;
  }
  async getMembers(tripId: string) {
    const data = this.check(await this.sb.from("trip_members").select("*").eq("trip_id", tripId).order("position"));
    return (data ?? []).map(rowToMember);
  }
  async updateMember(id: string, patch: Partial<Member>) {
    this.check(await this.sb.from("trip_members").update(memberToRow(patch)).eq("id", id));
  }
  async addMember(m: Member) {
    this.check(await this.sb.from("trip_members").insert(memberToRow(m)));
  }
  async deleteMember(id: string) {
    this.check(await this.sb.from("trip_members").delete().eq("id", id));
  }
  async getPreferences(tripId: string) {
    const data = this.check(await this.sb.from("trip_preferences").select("*").eq("trip_id", tripId));
    return (data ?? []).map(
      (r: Row): Preferences => ({
        memberId: r.member_id, tripId: r.trip_id, startingCity: r.starting_city, dates: r.dates ?? {},
        budget: r.budget, firmness: r.budget_firmness, tripTypes: r.trip_types ?? [], travelModes: r.travel_modes ?? [],
        dealBreakers: r.deal_breakers ?? [], dealBreakerOther: r.deal_breaker_other ?? "",
        anonymousDealBreakers: r.deal_breakers_anonymous ?? false, fitPrivate: r.fit_private ?? false,
        greatTrip: r.great_trip ?? "",
        updatedAt: r.updated_at,
      })
    );
  }
  async upsertPreferences(p: Preferences) {
    this.check(
      await this.sb.from("trip_preferences").upsert({
        member_id: p.memberId, trip_id: p.tripId, starting_city: p.startingCity, dates: p.dates, budget: p.budget,
        budget_firmness: p.firmness, trip_types: p.tripTypes, travel_modes: p.travelModes, deal_breakers: p.dealBreakers,
        deal_breaker_other: p.dealBreakerOther, deal_breakers_anonymous: p.anonymousDealBreakers, fit_private: p.fitPrivate,
        great_trip: p.greatTrip, updated_at: p.updatedAt,
      })
    );
  }
  async setFitPrivate(memberId: string, value: boolean) {
    this.check(await this.sb.from("trip_preferences").update({ fit_private: value }).eq("member_id", memberId));
  }
  async saveConstraints(c: Constraints) {
    this.check(
      await this.sb.from("trip_constraints").upsert({
        trip_id: c.tripId, round: c.round, date_windows: c.windows, budget_ceiling: c.budgetCeiling,
        soft_budget: c.softBudget, exclusions: c.exclusions, participant_ids: c.participantIds,
        missing_ids: c.missingIds, created_at: c.createdAt,
      })
    );
  }
  async getConstraints(tripId: string) {
    const data = this.check(await this.sb.from("trip_constraints").select("*").eq("trip_id", tripId).order("round"));
    return (data ?? []).map(
      (r: Row): Constraints => ({
        tripId: r.trip_id, round: r.round, windows: r.date_windows, budgetCeiling: r.budget_ceiling,
        softBudget: r.soft_budget, participantIds: r.participant_ids,
        // Rounds saved before attribution existed stored plain strings: treat them as anonymous.
        exclusions: (r.exclusions ?? []).map((x: string | Exclusion) =>
          typeof x === "string" ? { text: x, memberIds: [], anonymousCount: 1 } : x
        ),
        missingIds: r.missing_ids, createdAt: r.created_at,
      })
    );
  }
  async saveOptions(options: TripOption[]) {
    this.check(
      await this.sb.from("trip_options").insert(
        options.map(({ id, tripId, round, rank, destination, fits, minFit, avgFit, ...details }) => ({
          id, trip_id: tripId, round, rank, destination, details, fits, min_fit: minFit, avg_fit: avgFit,
        }))
      )
    );
  }
  async getOptions(tripId: string) {
    const data = this.check(
      await this.sb.from("trip_options").select("*").eq("trip_id", tripId).order("round").order("rank")
    );
    return (data ?? []).map(
      (r: Row): TripOption => ({
        ...r.details, id: r.id, tripId: r.trip_id, round: r.round, rank: r.rank, destination: r.destination,
        fits: r.fits, minFit: Number(r.min_fit), avgFit: Number(r.avg_fit),
      })
    );
  }
  async getVotes(tripId: string) {
    const data = this.check(await this.sb.from("trip_votes").select("*").eq("trip_id", tripId));
    return (data ?? []).map(
      (r: Row): Vote => ({
        tripId: r.trip_id, optionId: r.option_id, memberId: r.member_id, round: r.round, choice: r.choice,
        reason: r.reason ?? "", updatedAt: r.updated_at,
      })
    );
  }
  async upsertVote(v: Vote) {
    this.check(
      await this.sb.from("trip_votes").upsert(
        { trip_id: v.tripId, option_id: v.optionId, member_id: v.memberId, round: v.round, choice: v.choice, reason: v.reason, updated_at: v.updatedAt },
        { onConflict: "option_id,member_id" }
      )
    );
  }
  async addVoteChange(c: VoteChange) {
    this.check(
      await this.sb.from("trip_vote_changes").insert({
        id: c.id, trip_id: c.tripId, option_id: c.optionId, member_id: c.memberId, from_choice: c.fromChoice,
        to_choice: c.toChoice, reason: c.reason, created_at: c.createdAt,
      })
    );
  }
  async getVoteChanges(tripId: string) {
    const data = this.check(await this.sb.from("trip_vote_changes").select("*").eq("trip_id", tripId).order("created_at"));
    return (data ?? []).map(
      (r: Row): VoteChange => ({
        id: r.id, tripId: r.trip_id, optionId: r.option_id, memberId: r.member_id, fromChoice: r.from_choice,
        toChoice: r.to_choice, reason: r.reason, createdAt: r.created_at,
      })
    );
  }
  async saveLock(l: TripLock) {
    this.check(
      await this.sb.from("trip_locks").upsert({
        trip_id: l.tripId, option_id: l.optionId, in_member_ids: l.inMemberIds, left_out_ids: l.leftOutIds,
        checklist: l.checklist, locked_at: l.lockedAt,
      })
    );
  }
  async getLock(tripId: string) {
    const r = this.check(await this.sb.from("trip_locks").select("*").eq("trip_id", tripId).maybeSingle());
    return r
      ? { tripId: r.trip_id, optionId: r.option_id, inMemberIds: r.in_member_ids, leftOutIds: r.left_out_ids, checklist: r.checklist, lockedAt: r.locked_at }
      : null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Keep the connection and the in-memory data across hot reloads and route
// bundles in dev. The store classes themselves are cheap wrappers, so they're
// rebuilt each call and always run the current code.
const g = globalThis as unknown as { __tripSupabase?: SupabaseClient; __tripMemDb?: MemDb };

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getStore(): Store {
  if (isSupabaseConfigured()) {
    g.__tripSupabase ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    return new SupabaseStore(g.__tripSupabase);
  }
  g.__tripMemDb ??= { trips: new Map(), members: [], prefs: [], constraints: [], options: [], votes: [], changes: [], locks: [] };
  return new MemoryStore(g.__tripMemDb);
}
