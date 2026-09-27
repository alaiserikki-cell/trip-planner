export const TRIP_LENGTHS = ["2-3", "4-5", "6+"] as const;
export type TripLength = (typeof TRIP_LENGTHS)[number];

export const TRIP_LENGTH_LABEL: Record<TripLength, string> = {
  "2-3": "2–3 days",
  "4-5": "4–5 days",
  "6+": "6+ days",
};

export const TRIP_TYPES = ["Beach", "Mountains", "City & food", "Adventure", "Culture & heritage", "Just relax"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRAVEL_MODES = ["Flight", "Train", "Road trip"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const DEAL_BREAKERS = ["No overnight buses", "No treks", "No hostels", "No long road journeys"] as const;

export type DayMark = "available" | "maybe" | "no";
export type Firmness = "hard" | "stretch";
export type TripStatus = "collecting" | "generating" | "voting" | "deciding" | "locked";
export type VoteChoice = "in" | "maybe" | "out";
export type Marker = "green" | "amber" | "red";
export type BudgetFit = "Within" | "Stretch" | "Over";

export const BUDGET_MIN = 5000;
export const BUDGET_MAX = 100000;

// ---------- Stored records ----------

export interface Trip {
  id: string;
  name: string;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;
  tripLength: TripLength;
  deadline: string; // ISO
  status: TripStatus;
  round: number;
  organiserKey: string;
  generationStartedAt: string | null;
  generationError: string | null;
  votingClosedRound: number;
  createdAt: string;
}

export interface Member {
  id: string;
  tripId: string;
  name: string;
  position: number;
  isOrganiser: boolean;
  deviceToken: string | null;
  submittedAt: string | null;
}

export interface Preferences {
  memberId: string;
  tripId: string;
  startingCity: string;
  dates: Record<string, "available" | "maybe">; // dates not listed are "no"
  budget: number;
  firmness: Firmness;
  tripTypes: TripType[]; // in order of preference
  travelModes: TravelMode[];
  dealBreakers: string[];
  dealBreakerOther: string;
  /** Opt-in: show this person's deal-breakers as "Someone in the group…". Off by default. */
  anonymousDealBreakers: boolean;
  /** Opt-in: hide this person's fit row on each option from the rest of the group. Off by default. */
  fitPrivate: boolean;
  greatTrip: string;
  updatedAt: string;
}

export interface DateWindow {
  start: string;
  end: string;
  days: number;
  available: string[]; // member ids
  maybe: string[];
  no: string[];
}

export interface Exclusion {
  text: string;
  memberIds: string[]; // people who listed it and are happy to be named
  anonymousCount: number; // people who listed it and chose to stay anonymous
}

export interface Constraints {
  tripId: string;
  round: number;
  windows: DateWindow[];
  budgetCeiling: number | null; // lowest hard-limit budget
  softBudget: number; // lowest budget overall
  exclusions: Exclusion[]; // combined deal-breakers
  participantIds: string[];
  missingIds: string[];
  createdAt: string;
}

export interface Range {
  low: number;
  high: number;
}

export interface TravelLeg {
  memberId: string;
  fromCity: string;
  mode: TravelMode;
  route: string;
  durationHours: number; // one way, door to door, rough
  cost: Range; // return trip, per person
}

export interface Fit {
  memberId: string;
  submitted: boolean;
  dates: Marker;
  budget: Marker;
  budgetLabel: BudgetFit;
  tripType: Marker;
  travel: Marker;
  score: number; // 0..8
  summary: string;
  hidden?: boolean; // set only in what the API sends: this person keeps their fit private
}

export interface Photo {
  url: string;
  thumb: string;
  credit: string;
  creditUrl: string;
  color: string | null;
}

export interface TripOption {
  id: string;
  tripId: string;
  round: number;
  rank: number;
  destination: string;
  region: string;
  tripTypes: TripType[];
  startDate: string;
  endDate: string;
  days: string[];
  stay: Range; // per person, whole trip
  dailySpend: Range; // per person, whole trip
  travel: TravelLeg[];
  why: string;
  photo: Photo | null;
  fits: Fit[];
  minFit: number;
  avgFit: number;
}

export interface Vote {
  tripId: string;
  optionId: string;
  memberId: string;
  round: number;
  choice: VoteChoice;
  reason: string;
  updatedAt: string;
}

export interface VoteChange {
  id: string;
  tripId: string;
  optionId: string;
  memberId: string;
  fromChoice: VoteChoice;
  toChoice: VoteChoice;
  reason: string;
  createdAt: string;
}

export interface ChecklistItem {
  text: string;
  by: string | null; // YYYY-MM-DD
}

export interface TripLock {
  tripId: string;
  optionId: string;
  inMemberIds: string[];
  leftOutIds: string[];
  checklist: ChecklistItem[];
  lockedAt: string;
}

// ---------- What the API sends to a browser (scoped per viewer) ----------

export interface MemberView {
  id: string;
  name: string;
  isOrganiser: boolean;
  submitted: boolean;
  claimed: boolean;
  votedAll: boolean; // finished voting in the current round
}

export interface VoteSummary {
  closed: boolean;
  participantIds: string[];
  finishedCount: number;
  myVotes: Record<string, { choice: VoteChoice; reason: string }>;
  // Only present once voting is closed:
  all: { optionId: string; memberId: string; choice: VoteChoice; reason: string }[] | null;
}

export interface RoundView {
  round: number;
  options: TripOption[];
  exclusions: string[];
  missingIds: string[];
  unmet: { memberId: string; text: string }[];
  /** Group-level numbers per option. Computed from everyone's fit, but never reveal a person. */
  stats: Record<string, { groupScore: number; limitsBroken: number; worksWell: number; total: number }>;
  votes: VoteSummary;
  changes: VoteChange[];
}

export interface Blocker {
  optionId: string;
  lines: string[];
}

export interface TripView {
  trip: Omit<Trip, "organiserKey">;
  members: MemberView[];
  me: { memberId: string; name: string; preferences: Preferences | null } | null;
  isOrganiser: boolean;
  deadlinePassed: boolean;
  generationStale: boolean;
  rounds: RoundView[];
  cleanOptionIds: string[]; // current round options nobody is out on (after close)
  blocker: Blocker | null; // stalemate after the final round
  lock: TripLock | null;
  now: string;
}
