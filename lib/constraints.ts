// Step 1 of option generation, plus every other bit of scoring that must be
// deterministic: date windows, budget ceiling, exclusions, fit markers, ranking,
// stalemate diagnosis and the post-lock checklist. No AI in this file.

import { addDays, daysBetween, eachDate, prettyDate, prettyRange, todayISO } from "./dates";
import type {
  BudgetFit,
  ChecklistItem,
  Constraints,
  DateWindow,
  Exclusion,
  Fit,
  Marker,
  Member,
  Preferences,
  Trip,
  TripLength,
  TripOption,
  Vote,
} from "./types";

const WINDOW_LENGTHS: Record<TripLength, number[]> = {
  "2-3": [3, 2],
  "4-5": [5, 4],
  "6+": [7, 6],
};

export function personWindowStatus(prefs: Preferences, start: string, end: string): "available" | "maybe" | "no" {
  let status: "available" | "maybe" = "available";
  for (const d of eachDate(start, end)) {
    const mark = prefs.dates[d];
    if (!mark) return "no";
    if (mark === "maybe") status = "maybe";
  }
  return status;
}

export function findDateWindows(trip: Trip, prefs: Preferences[], limit = 5): DateWindow[] {
  const candidates: DateWindow[] = [];
  for (const days of WINDOW_LENGTHS[trip.tripLength]) {
    for (let start = trip.windowStart; addDays(start, days - 1) <= trip.windowEnd; start = addDays(start, 1)) {
      const end = addDays(start, days - 1);
      const w: DateWindow = { start, end, days, available: [], maybe: [], no: [] };
      for (const p of prefs) w[personWindowStatus(p, start, end)].push(p.memberId);
      candidates.push(w);
    }
  }
  // Most people Available, then most Maybe, then the longer trip, then the earlier date.
  candidates.sort(
    (a, b) =>
      b.available.length - a.available.length ||
      b.maybe.length - a.maybe.length ||
      b.days - a.days ||
      a.start.localeCompare(b.start)
  );
  const picked: DateWindow[] = [];
  for (const c of candidates) {
    if (picked.some((p) => !(c.end < p.start || c.start > p.end))) continue;
    picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function combineExclusions(prefs: Preferences[]): Exclusion[] {
  const seen = new Map<string, Exclusion>();
  for (const p of prefs) {
    const extra = p.dealBreakerOther
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const item of [...p.dealBreakers, ...extra]) {
      const key = item.toLowerCase().replace(/\s+/g, " ");
      const x = seen.get(key) ?? { text: item, memberIds: [], anonymousCount: 0 };
      if (p.anonymousDealBreakers) x.anonymousCount++;
      else if (!x.memberIds.includes(p.memberId)) x.memberIds.push(p.memberId);
      seen.set(key, x);
    }
  }
  return Array.from(seen.values());
}

/**
 * How an exclusion is shown on shared screens. People are named unless they
 * chose to keep their deal-breakers anonymous.
 */
export function exclusionLine(x: Exclusion, nameOf: (id: string) => string): string {
  const named = x.memberIds.map(nameOf);
  const n = x.anonymousCount;
  if (n && !named.length) named.push(n === 1 ? "Someone in the group" : `${n} people in the group`);
  else if (n) named.push(n === 1 ? "1 other" : `${n} others`);
  const who = named.length <= 1 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  const m = x.text.match(/^no\s+(.+)$/i);
  return m ? `${who} ruled out ${m[1].toLowerCase()}` : `${who} said “${x.text}”`;
}

export function computeConstraints(trip: Trip, members: Member[], prefs: Preferences[], round: number): Constraints {
  const submitted = members.filter((m) => m.submittedAt && prefs.some((p) => p.memberId === m.id));
  const participantIds = submitted.map((m) => m.id);
  const partPrefs = prefs.filter((p) => participantIds.includes(p.memberId));
  const hard = partPrefs.filter((p) => p.firmness === "hard").map((p) => p.budget);
  return {
    tripId: trip.id,
    round,
    windows: findDateWindows(trip, partPrefs),
    budgetCeiling: hard.length ? Math.min(...hard) : null,
    softBudget: partPrefs.length ? Math.min(...partPrefs.map((p) => p.budget)) : 0,
    exclusions: combineExclusions(partPrefs),
    participantIds,
    missingIds: members.filter((m) => !participantIds.includes(m.id)).map((m) => m.id),
    createdAt: new Date().toISOString(),
  };
}

// ---------- Fit ----------

const POINTS: Record<Marker, number> = { green: 2, amber: 1, red: 0 };

export function personTotal(option: Pick<TripOption, "travel" | "stay" | "dailySpend">, memberId: string) {
  const leg = option.travel.find((t) => t.memberId === memberId);
  return {
    low: (leg?.cost.low ?? 0) + option.stay.low + option.dailySpend.low,
    high: (leg?.cost.high ?? 0) + option.stay.high + option.dailySpend.high,
  };
}

function budgetFit(total: { low: number; high: number }, p: Preferences): BudgetFit {
  if (total.high <= p.budget) return "Within";
  const stretchLimit = p.firmness === "hard" ? p.budget : p.budget * 1.2;
  return total.low <= stretchLimit ? "Stretch" : "Over";
}

const BUDGET_MARKER: Record<BudgetFit, Marker> = { Within: "green", Stretch: "amber", Over: "red" };

export function computeFit(option: Omit<TripOption, "fits" | "minFit" | "avgFit">, member: Member, prefs: Preferences | undefined): Fit {
  if (!prefs) {
    return {
      memberId: member.id, submitted: false, dates: "amber", budget: "amber", budgetLabel: "Stretch",
      tripType: "amber", travel: "amber", score: 0, summary: `${member.name}: No preferences submitted.`,
    };
  }
  const ds = personWindowStatus(prefs, option.startDate, option.endDate);
  const dates: Marker = ds === "available" ? "green" : ds === "maybe" ? "amber" : "red";

  const budgetLabel = budgetFit(personTotal(option, member.id), prefs);

  let tripType: Marker = "green";
  if (prefs.tripTypes.length) {
    if (option.tripTypes.includes(prefs.tripTypes[0])) tripType = "green";
    else if (prefs.tripTypes.some((t) => option.tripTypes.includes(t))) tripType = "amber";
    else tripType = "red";
  }

  const leg = option.travel.find((t) => t.memberId === member.id);
  let travel: Marker = "amber";
  if (leg) {
    const modeOk = !prefs.travelModes.length || prefs.travelModes.includes(leg.mode);
    travel = !modeOk ? "red" : leg.durationHours > 12 ? "amber" : "green";
  }

  const budget = BUDGET_MARKER[budgetLabel];
  const fit: Fit = {
    memberId: member.id, submitted: true, dates, budget, budgetLabel, tripType, travel,
    score: POINTS[dates] + POINTS[budget] + POINTS[tripType] + POINTS[travel],
    summary: "",
  };
  fit.summary = templateSummary(member.name, fit, prefs, option);
  return fit;
}

/** Plain-language fallback used when the AI isn't available (and as a privacy-safe default). */
export function templateSummary(name: string, fit: Fit, prefs: Preferences, option: Pick<TripOption, "tripTypes">): string {
  const parts: string[] = [];
  parts.push(fit.dates === "green" ? "dates work" : fit.dates === "amber" ? "dates are a maybe" : "can't do these dates");
  parts.push(
    fit.budgetLabel === "Within" ? "within budget" : fit.budgetLabel === "Stretch" ? "a little above their comfortable budget" : "over budget"
  );
  const idx = prefs.tripTypes.findIndex((t) => option.tripTypes.includes(t));
  if (idx === 0) parts.push(`${prefs.tripTypes[0].toLowerCase()} was their first choice`);
  else if (idx > 0) parts.push(`${prefs.tripTypes[idx].toLowerCase()} was their ${idx === 1 ? "second" : "third"} choice`);
  else if (prefs.tripTypes.length) parts.push("not the kind of trip they picked");
  if (fit.travel === "red") parts.push("the route uses a travel mode they didn't pick");
  else if (fit.travel === "amber") parts.push("a long journey to get there");
  return `${name}: ${parts.join(", ")}.`;
}

export function applyFits(
  options: Omit<TripOption, "fits" | "minFit" | "avgFit" | "rank">[],
  members: Member[],
  prefs: Preferences[]
): TripOption[] {
  const withFits = options.map((o) => {
    const fits = members.map((m) => computeFit({ ...o, rank: 0 }, m, prefs.find((p) => p.memberId === m.id)));
    const scored = fits.filter((f) => f.submitted).map((f) => f.score);
    return {
      ...o,
      rank: 0,
      fits,
      minFit: scored.length ? Math.min(...scored) : 0,
      avgFit: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0,
    };
  });
  // Nobody left badly off first, then the group average.
  withFits.sort((a, b) => b.minFit - a.minFit || b.avgFit - a.avgFit);
  return withFits.map((o, i) => ({ ...o, rank: i + 1 }));
}

export const RANKING_NOTE = "Ranked so nobody is left badly off: first by the person it suits least, then by how well it suits the group overall.";

const DIM_LABEL = { dates: "Dates", budget: "Budget", tripType: "Trip type", travel: "Travel" } as const;
type Dim = keyof typeof DIM_LABEL;
const DIMS: Dim[] = ["dates", "budget", "tripType", "travel"];

export function unmetConstraints(
  options: TripOption[],
  members: Member[],
  privateIds: string[] = []
): { memberId: string; text: string }[] {
  if (!options.length) return [];
  const out: { memberId: string; text: string }[] = [];
  for (const m of members) {
    const fits = options.map((o) => o.fits.find((f) => f.memberId === m.id)).filter((f): f is Fit => !!f && f.submitted);
    if (fits.length !== options.length) continue;
    if (!fits.every((f) => DIMS.some((d) => f[d] === "red"))) continue;
    const always = DIMS.filter((d) => fits.every((f) => f[d] === "red"));
    const reasons = always.map((d) =>
      d === "dates" ? "none of the proposed dates work"
        : d === "budget" ? "every option is over budget"
        : d === "tripType" ? "none of them is the kind of trip they picked"
        : "no route uses a travel mode they picked"
    );
    out.push({
      memberId: m.id,
      // Someone who keeps their fit private isn't named, and neither is what's missing for them.
      text: privateIds.includes(m.id)
        ? "No option fully works for one person in the group."
        : `No option fully works for ${m.name}: ${reasons.length ? reasons.join(" and ") : "every option has at least one clear miss for them"}.`,
    });
  }
  return out;
}

/** The group-level view of an option: one score, and how many people's limits it breaks (no names). */
export function optionStats(option: TripOption) {
  const fits = option.fits.filter((f) => f.submitted);
  const breaks = (f: Fit) => f.dates === "red" || f.budget === "red" || f.travel === "red";
  return {
    groupScore: fits.length ? Math.round((fits.reduce((a, f) => a + f.score, 0) / (fits.length * 8)) * 100) : 0,
    limitsBroken: fits.filter(breaks).length,
    worksWell: fits.filter((f) => [f.dates, f.budget, f.tripType, f.travel].every((m) => m === "green")).length,
    total: fits.length,
  };
}

// ---------- Voting outcomes ----------

export function optionsWithoutOuts(options: TripOption[], votes: Vote[]): TripOption[] {
  return options.filter((o) => !votes.some((v) => v.optionId === o.id && v.choice === "out"));
}

export function mostSupported(options: TripOption[], votes: Vote[]): TripOption | null {
  const tally = (o: TripOption, c: Vote["choice"]) => votes.filter((v) => v.optionId === o.id && v.choice === c).length;
  return (
    [...options].sort(
      (a, b) => tally(a, "out") - tally(b, "out") || tally(b, "in") - tally(a, "in") || tally(b, "maybe") - tally(a, "maybe") || a.rank - b.rank
    )[0] ?? null
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function diagnoseBlocker(option: TripOption, votes: Vote[], members: Member[], privateIds: string[] = []): string[] {
  const outs = votes.filter((v) => v.optionId === option.id && v.choice === "out");
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
  const lines: string[] = [];
  const explained = new Set<string>();
  for (const d of DIMS) {
    const who = outs
      .filter((v) => !privateIds.includes(v.memberId))
      .filter((v) => option.fits.find((f) => f.memberId === v.memberId)?.[d] === "red")
      .map((v) => v.memberId);
    if (!who.length) continue;
    who.forEach((id) => explained.add(id));
    const names = listNames(who.map(nameOf));
    const n = who.length === 1 ? "1 person" : `${who.length} people`;
    const detail =
      d === "dates" ? `can't do ${prettyRange(option.startDate, option.endDate)}`
        : d === "budget" ? "would be over budget"
        : d === "tripType" ? "wanted a different kind of trip"
        : "can't use the proposed travel mode";
    lines.push(`${DIM_LABEL[d]}: ${n} (${names}) ${detail}`);
  }
  for (const v of outs) {
    if (explained.has(v.memberId)) continue;
    lines.push(`${nameOf(v.memberId)} is out: “${v.reason}”`);
  }
  return lines;
}

// ---------- After locking ----------

export function buildChecklist(option: TripOption, today = todayISO()): ChecklistItem[] {
  const clamp = (d: string) => (d < today ? today : d);
  const soon = addDays(today, 3);
  const lead = daysBetween(today, option.startDate);
  const modes = new Set(option.travel.map((t) => t.mode));
  const items: ChecklistItem[] = [];

  if (modes.has("Train")) {
    // Indian Railways opens reservations 60 days ahead.
    const opens = addDays(option.startDate, -60);
    items.push(
      opens > today
        ? { text: `Book trains the day booking opens (${prettyDate(opens)})`, by: opens }
        : { text: `Book trains by ${prettyDate(soon)}, booking is already open`, by: soon }
    );
  }
  if (modes.has("Flight")) {
    const by = clamp(lead > 45 ? addDays(option.startDate, -30) : soon);
    items.push({ text: `Book flights by ${prettyDate(by)}`, by });
  }
  if (modes.has("Road trip")) {
    items.push({ text: "Sort out who drives and whose car, or book a self-drive", by: clamp(addDays(option.startDate, -14)) });
  }
  const stayBy = clamp(lead > 30 ? addDays(option.startDate, -21) : soon);
  items.push({ text: `Book the stay by ${prettyDate(stayBy)}`, by: stayBy });
  items.push({ text: "Pick one person to collect money and track shared expenses", by: null });
  return items;
}
