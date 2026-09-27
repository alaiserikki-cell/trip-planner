// Step 2 of option generation: turn the computed constraints plus everyone's
// answers into three concrete trip options. Uses Gemini when GEMINI_API_KEY
// is set; otherwise a small offline planner keeps the whole flow usable.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { monthOf, prettyRange } from "./dates";
import { DESTINATIONS, Destination, LibraryDestination, findCity } from "./places";
import {
  TRAVEL_MODES,
  TRIP_LENGTH_LABEL,
  TRIP_TYPES,
  type Constraints,
  type Member,
  type Preferences,
  type Range,
  type TravelLeg,
  type TravelMode,
  type Trip,
  type TripOption,
  type TripType,
  type Vote,
} from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export function isAIConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Gemini accepts a subset of JSON Schema: drop the keys it doesn't need.
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "$schema" || k === "minimum" || k === "maximum" || k === "additionalProperties") continue;
    out[k] = toGeminiSchema(v);
  }
  return out;
}

/** Ask Gemini for JSON matching `schema`, and validate it before trusting it. */
async function generateJson<T extends z.ZodType>(schema: T, system: string, prompt: string): Promise<z.infer<T>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const request = {
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(z.toJSONSchema(schema)),
    },
  };
  // "Busy" (503) usually clears within seconds, so retry it. "Quota used up" (429)
  // won't clear until the quota resets, and every retry spends more of it.
  const delays = [2000, 5000, 10000];
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await ai.models.generateContent(request);
      if (!res.text) throw new Error("Gemini returned an empty response");
      return schema.parse(JSON.parse(res.text));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status !== 503 || attempt >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

export interface Person {
  member: Member;
  prefs: Preferences;
}

export type DraftOption = Omit<TripOption, "id" | "tripId" | "round" | "rank" | "photo" | "fits" | "minFit" | "avgFit"> & {
  photoQuery: string;
  lat?: number; // from Gemini, so the place can be remembered and reused offline
  lng?: number;
};

export interface PreviousRound {
  options: TripOption[];
  votes: Vote[];
}

export interface PlanInput {
  trip: Trip;
  constraints: Constraints;
  people: Person[];
  missing: Member[];
  previous: PreviousRound | null;
}

// ---------- Gemini ----------

const PlanSchema = z.object({
  options: z.array(
    z.object({
      destination: z.string().describe("Place name, e.g. 'Gokarna'"),
      region: z.string().describe("State or country, e.g. 'Karnataka'"),
      lat: z.number().describe("Approximate latitude of the destination"),
      lng: z.number().describe("Approximate longitude of the destination"),
      photoQuery: z.string().describe("A short Unsplash search query for a scenic cover photo of this destination"),
      tripTypes: z.array(z.enum(TRIP_TYPES)).describe("Which of the trip types this option delivers, most relevant first"),
      windowIndex: z.number().int().describe("Index of the candidate date window this option uses"),
      days: z.array(z.string()).describe("One short line per day, exactly as many lines as the window has days"),
      stayLow: z.number().int().describe("Stay cost per person for the whole trip, low end, INR"),
      stayHigh: z.number().int(),
      dailySpendLow: z.number().int().describe("Food, local transport and activities per person for the whole trip, low end, INR"),
      dailySpendHigh: z.number().int(),
      travel: z.array(
        z.object({
          person: z.string().describe("Exact name of the person"),
          mode: z.enum(TRAVEL_MODES),
          route: z.string().describe("How they get there, e.g. 'Pune → Goa by train, then 1h cab'"),
          durationHours: z.number().describe("Rough one-way door-to-door hours"),
          costLow: z.number().int().describe("Return travel cost per person, low end, INR"),
          costHigh: z.number().int(),
        })
      ),
      why: z.string().describe("One line on why this option made the list"),
    })
  ),
});

const SYSTEM = `You plan group trips for friends in India who live in different cities.
You get constraints that were computed in code, plus each person's own answers. Produce exactly 3 distinct trip options.

Hard rules — an option that breaks one is wrong:
- Dates: use one of the candidate date windows by index. Prefer windows where more people are Available.
- Budget: if a budget ceiling is given, every person's estimated total (return travel + stay + daily spend, high end) must be at or below it.
- Exclusions: never propose anything an exclusion rules out (a destination, an activity, a kind of stay or transport).
- Travel: each person's mode must be one they selected. Give one travel entry for every person listed under "People", using their exact name.
- Day plan: exactly one short line per day of the chosen window.

Estimates:
- All money is a rough INR estimate per person, given as a low–high range that honestly reflects uncertainty (season, booking time). Never present a price as exact or certain.
- Travel cost is return (both ways). Stay assumes friends sharing rooms.

Privacy — the text you write is shown to the whole group:
- Never mention anyone's budget amount or the budget ceiling in any text field.
- Never say who set a deal-breaker or exclusion.
- Don't use gendered pronouns for people.

Make the three options genuinely different (e.g. beach vs mountains vs city), each a strong fit for the group as a whole, not just the loudest preference. Read the free-text answers closely; they often decide between two otherwise equal ideas.`;

function describeBrief(input: PlanInput): string {
  const { trip, constraints, people, missing, previous } = input;
  const nameOf = (id: string) => people.find((p) => p.member.id === id)?.member.name ?? "?";
  const lines: string[] = [];
  lines.push(`Trip: "${trip.name}", ${TRIP_LENGTH_LABEL[trip.tripLength]}, sometime between ${trip.windowStart} and ${trip.windowEnd}.`);
  lines.push("", "Candidate date windows (computed from everyone's calendars):");
  constraints.windows.forEach((w, i) => {
    lines.push(
      `  [${i}] ${w.start} to ${w.end} (${w.days} days, ${prettyRange(w.start, w.end)}) — available: ${w.available.map(nameOf).join(", ") || "nobody"}; maybe: ${w.maybe.map(nameOf).join(", ") || "nobody"}; can't: ${w.no.map(nameOf).join(", ") || "nobody"}`
    );
  });
  lines.push(
    "",
    constraints.budgetCeiling
      ? `Budget ceiling (lowest hard limit in the group): ₹${constraints.budgetCeiling} per person for the whole trip.`
      : "Nobody set a hard budget limit.",
    `Lowest budget anyone gave: ₹${constraints.softBudget}.`
  );
  lines.push("", "Hard exclusions (combined deal-breakers):");
  lines.push(constraints.exclusions.length ? constraints.exclusions.map((x) => `  - ${x.text}`).join("\n") : "  (none)");
  lines.push("", "People:");
  for (const { member, prefs } of people) {
    lines.push(
      `- ${member.name}: from ${prefs.startingCity}; budget ₹${prefs.budget} (${prefs.firmness === "hard" ? "hard limit" : "can stretch a little"}); ` +
        `trip types in order: ${prefs.tripTypes.join(" > ") || "no preference"}; travel modes: ${prefs.travelModes.join(", ") || "any"}; ` +
        `great trip means: "${prefs.greatTrip || "(nothing written)"}"`
    );
  }
  if (missing.length) {
    lines.push("", `Didn't submit preferences (no travel entry needed): ${missing.map((m) => m.name).join(", ")}.`);
  }
  if (previous) {
    lines.push("", "This is round 2. Round 1 options did not work for everyone. Do NOT repeat any of these destinations:");
    for (const o of previous.options) {
      const vs = previous.votes.filter((v) => v.optionId === o.id);
      const count = (c: string) => vs.filter((v) => v.choice === c).length;
      lines.push(`- ${o.destination} (${o.startDate} to ${o.endDate}): ${count("in")} in, ${count("maybe")} would go if needed, ${count("out")} out`);
      for (const v of vs.filter((v) => v.choice === "out")) {
        const who = people.find((p) => p.member.id === v.memberId)?.member.name ?? "Someone";
        lines.push(`    ${who} is out: "${v.reason}"`);
      }
    }
    lines.push("Use the votes and the 'out' reasons to propose three new options that fix what blocked round 1.");
  }
  return lines.join("\n");
}

async function planWithAI(input: PlanInput): Promise<DraftOption[]> {
  const plan = await generateJson(PlanSchema, SYSTEM, describeBrief(input));

  const { constraints, people } = input;
  const used = new Set((input.previous?.options ?? []).map((o) => o.destination.toLowerCase()));
  const drafts: DraftOption[] = [];
  for (const o of plan.options) {
    if (used.has(o.destination.toLowerCase())) continue; // dedupe against round 1
    used.add(o.destination.toLowerCase());
    const w = constraints.windows[o.windowIndex] ?? constraints.windows[0];
    const travel: TravelLeg[] = people.map(({ member, prefs }) => {
      const t = o.travel.find((x) => x.person.trim().toLowerCase() === member.name.toLowerCase());
      if (!t) return estimateLeg(member.id, prefs, { ...findDest(o.destination), name: o.destination, lat: o.lat, lng: o.lng });
      return {
        memberId: member.id,
        fromCity: prefs.startingCity,
        mode: t.mode,
        route: t.route,
        durationHours: t.durationHours,
        cost: orderRange(t.costLow, t.costHigh),
      };
    });
    drafts.push({
      destination: o.destination,
      region: o.region,
      lat: o.lat,
      lng: o.lng,
      photoQuery: o.photoQuery || `${o.destination} ${o.region}`,
      tripTypes: o.tripTypes.length ? o.tripTypes : ["Just relax"],
      startDate: w.start,
      endDate: w.end,
      days: fitDays(o.days, w.days),
      stay: orderRange(o.stayLow, o.stayHigh),
      dailySpend: orderRange(o.dailySpendLow, o.dailySpendHigh),
      travel,
      why: scrubMoney(o.why, "A strong overall fit for the group's dates and trip types."),
    });
    if (drafts.length === 3) break;
  }
  if (!drafts.length) throw new Error("Gemini returned no usable options");
  return drafts;
}

const SummarySchema = z.object({
  summaries: z.array(z.object({ option: z.number().int(), person: z.string(), sentence: z.string() })),
});

async function summariesWithAI(options: TripOption[], people: Person[]): Promise<Map<string, string>> {
  const lines: string[] = [];
  options.forEach((o, i) => {
    lines.push(`Option ${i}: ${o.destination} (${o.tripTypes.join(", ")}), ${prettyRange(o.startDate, o.endDate)}`);
    for (const f of o.fits) {
      const p = people.find((x) => x.member.id === f.memberId);
      if (!p || !f.submitted) continue;
      const leg = o.travel.find((t) => t.memberId === f.memberId);
      const rank = p.prefs.tripTypes.findIndex((t) => o.tripTypes.includes(t));
      lines.push(
        `  - ${p.member.name}: dates=${f.dates === "green" ? "available" : f.dates === "amber" ? "maybe" : "can't"}; ` +
          `budget=${f.budgetLabel}; trip type=${rank < 0 ? "none of their picks" : `their choice #${rank + 1} (${p.prefs.tripTypes[rank]})`}; ` +
          `travel=${leg ? `${leg.mode}, ~${Math.round(leg.durationHours)}h${f.travel === "red" ? ", a mode they didn't pick" : ""}` : "unknown"}; ` +
          `wants: "${p.prefs.greatTrip}"`
      );
    }
  });
  const res = await generateJson(
    SummarySchema,
    "For each person on each option, write one plain, friendly sentence (under 22 words) that starts with their name and a colon, " +
      "saying where they stand on dates, budget, trip type and travel. Example: \"Karan: dates work, a little above the comfortable budget, mountains was the second choice.\" " +
      "Describe budget only as within / a little above / over their budget — never an amount. Never mention deal-breakers. No gendered pronouns. " +
      "The option field is the option number given.",
    lines.join("\n")
  );
  const out = new Map<string, string>();
  for (const s of res.summaries) {
    const o = options[s.option];
    const p = people.find((x) => x.member.name.toLowerCase() === s.person.trim().toLowerCase());
    if (!o || !p) continue;
    const sentence = s.sentence.trim();
    // Only accept sentences that are clearly about this person and leak no amounts.
    if (!sentence.toLowerCase().startsWith(p.member.name.toLowerCase()) || /₹|\brs\.?\s*\d|\binr\b|\d{3,}|\d+k\b/i.test(sentence)) continue;
    out.set(`${o.id}:${p.member.id}`, sentence);
  }
  return out;
}

// ---------- Offline planner ----------

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const round500 = (n: number) => Math.max(500, Math.round(n / 500) * 500);
const orderRange = (a: number, b: number): Range => ({ low: Math.min(a, b), high: Math.max(a, b) });

function findDest(name: string): Destination {
  const n = name.toLowerCase();
  return DESTINATIONS.find((d) => n.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(n)) ?? DESTINATIONS[0];
}

function estimateLeg(memberId: string, prefs: Preferences, dest: Destination): TravelLeg {
  const city = findCity(prefs.startingCity);
  const km = city ? haversineKm(city, dest) * 1.25 : 1200;
  const from = city?.name ?? prefs.startingCity;
  if (km < 40) {
    return { memberId, fromCity: prefs.startingCity, mode: "Road trip", route: `Already local to ${dest.name}`, durationHours: 0.5, cost: { low: 500, high: 1000 } };
  }
  const allowed: TravelMode[] = prefs.travelModes.length ? prefs.travelModes : [...TRAVEL_MODES];
  const options: (TravelLeg & { score: number })[] = [];
  for (const mode of allowed) {
    let hours: number, oneWay: number, route: string;
    if (mode === "Flight") {
      if (km < 450 && allowed.length > 1) continue;
      hours = 2.5 + km / 650 + dest.airportHours;
      oneWay = 2500 + km * 3.2;
      route = `${from} → ${dest.name} by flight${dest.airportHours >= 1 ? `, then ~${Math.round(dest.airportHours)}h by road` : ""}`;
    } else if (mode === "Train") {
      if (dest.trainHours >= 99) continue;
      hours = km / 55 + dest.trainHours;
      oneWay = km * 1.1 + 300;
      route = `${from} → ${dest.name} by train${dest.trainHours >= 1 ? `, then ~${Math.round(dest.trainHours)}h by road` : ""}`;
    } else {
      if (km > 900 && allowed.length > 1) continue;
      hours = km / 45;
      oneWay = (km * 7) / 4; // fuel + tolls, split four ways
      route = `${from} → ${dest.name} by road`;
    }
    options.push({
      memberId, fromCity: prefs.startingCity, mode, route, durationHours: Math.round(hours * 2) / 2,
      cost: { low: round500(oneWay * 2 * 0.8), high: round500(oneWay * 2 * 1.35) },
      score: hours * 400 + oneWay,
    });
  }
  if (!options.length) {
    // Nothing in their chosen modes reaches this place; fall back to the fastest option overall.
    return estimateLeg(memberId, { ...prefs, travelModes: [] }, dest);
  }
  options.sort((a, b) => a.score - b.score);
  const { memberId: id, fromCity, mode, route, durationHours, cost } = options[0];
  return { memberId: id, fromCity, mode, route, durationHours, cost };
}

function fitDays(lines: string[], n: number): string[] {
  const out = lines.slice(0, n);
  while (out.length < n) out.splice(Math.max(0, out.length - 1), 0, "Free day to explore at your own pace");
  return out;
}

function scrubMoney(text: string, fallback: string): string {
  return /₹|\brs\.?\s*\d|\binr\b|\d{4,}|\d+k\b/i.test(text) ? fallback : text;
}

function offlineDays(dest: Destination, n: number, noTreks: boolean): string[] {
  const h = dest.highlights.map((l) => (noTreks && /trek|hike/i.test(l) ? "Easy scenic walk, then a long café lunch" : l));
  if (n >= h.length) {
    const middle = h.slice(1, -1);
    const extra = Array.from({ length: n - h.length }, () => "Slow day: revisit a favourite spot or just rest");
    return [h[0], ...middle, ...extra, h[h.length - 1]];
  }
  return [...h.slice(0, n - 1), h[h.length - 1]];
}

function planOffline(input: PlanInput, library: LibraryDestination[] = []): DraftOption[] {
  const { constraints, people, previous } = input;
  const used = new Set((previous?.options ?? []).map((o) => o.destination.toLowerCase()));
  const excl = constraints.exclusions.map((x) => x.text).join(" | ").toLowerCase();
  const noTreks = /trek/.test(excl);
  const windows = constraints.windows.length ? constraints.windows : [];
  if (!windows.length) throw new Error("No date windows to plan around");

  // Built-in catalogue plus every place Gemini has planned before (remembered in the database).
  const pool: Destination[] = [
    ...DESTINATIONS,
    ...library.filter((l) => !DESTINATIONS.some((d) => d.name.toLowerCase() === l.name.toLowerCase())),
  ];
  const scored = pool.filter((d) => !used.has(d.name.toLowerCase()) && !excl.includes(d.name.toLowerCase())).map((d) => {
    const window = windows.slice(0, 3).find((w) => d.goodMonths.includes(monthOf(w.start))) ?? windows[0];
    const nights = Math.max(1, window.days - 1);
    const stay: Range = { low: round500(d.stayPerNight[0] * nights), high: round500(d.stayPerNight[1] * nights) };
    const dailySpend: Range = { low: round500(d.spendPerDay[0] * window.days), high: round500(d.spendPerDay[1] * window.days) };
    const travel = people.map((p) => estimateLeg(p.member.id, p.prefs, d));
    let score = 0;
    for (const p of people) {
      const rank = p.prefs.tripTypes.findIndex((t) => d.types.includes(t));
      score += rank < 0 ? 0 : 3 - rank;
      const leg = travel.find((t) => t.memberId === p.member.id)!;
      const total = leg.cost.high + stay.high + dailySpend.high;
      if (total > p.prefs.budget) score -= p.prefs.firmness === "hard" ? 4 : 1.5;
      if (leg.durationHours > 14) score -= 1.5;
      if (p.prefs.travelModes.length && !p.prefs.travelModes.includes(leg.mode)) score -= 3;
    }
    if (!d.goodMonths.includes(monthOf(window.start))) score -= people.length * 1.5;
    if (noTreks && d.involvesTrek) score -= people.length;
    return { d, window, stay, dailySpend, travel, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Keep the three options varied: avoid two with the same headline trip type.
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.some((p) => p.d.types[0] === s.d.types[0]) && scored.length - picked.length > 3) continue;
    picked.push(s);
    if (picked.length === 3) break;
  }

  return picked.map(({ d, window, stay, dailySpend, travel }) => {
    const matches = new Set<TripType>(people.flatMap((p) => p.prefs.tripTypes.filter((t) => d.types.includes(t))));
    const free = window.available.length;
    return {
      destination: d.name,
      region: d.region,
      photoQuery: `${d.name} ${d.region} India`,
      tripTypes: d.types,
      startDate: window.start,
      endDate: window.end,
      days: offlineDays(d, window.days, noTreks),
      stay,
      dailySpend,
      travel,
      why: `${free} of ${people.length} fully free on these dates${matches.size ? `, and it covers ${Array.from(matches).slice(0, 2).join(" and ").toLowerCase()}` : ""}.`,
    };
  });
}

// ---------- Public API ----------

export async function planOptions(
  input: PlanInput,
  library: LibraryDestination[] = []
): Promise<{ drafts: DraftOption[]; source: "ai" | "offline" }> {
  if (isAIConfigured()) {
    try {
      return { drafts: await planWithAI(input), source: "ai" };
    } catch (e) {
      console.error("[planner] Gemini planning failed, using the saved destination library:", e);
    }
  }
  return { drafts: planOffline(input, library), source: "offline" };
}

/** Turn a Gemini-planned option into a reusable library entry (per-night / per-day bands). */
export function toLibraryEntry(d: DraftOption, existing?: LibraryDestination): LibraryDestination | null {
  if (typeof d.lat !== "number" || typeof d.lng !== "number" || !d.days.length) return null;
  const days = d.days.length;
  const nights = Math.max(1, days - 1);
  const m = monthOf(d.startDate);
  const months = new Set([...(existing?.goodMonths ?? []), ((m + 10) % 12) + 1, m, (m % 12) + 1]);
  return {
    key: d.destination.trim().toLowerCase(),
    name: d.destination,
    region: d.region,
    lat: d.lat,
    lng: d.lng,
    types: d.tripTypes,
    airportHours: 1.5,
    trainHours: 1,
    stayPerNight: [Math.round(d.stay.low / nights), Math.round(d.stay.high / nights)],
    spendPerDay: [Math.round(d.dailySpend.low / days), Math.round(d.dailySpend.high / days)],
    goodMonths: Array.from(months).sort((a, b) => a - b),
    involvesTrek: /trek|hike/i.test(d.days.join(" ")),
    highlights: d.days,
    uses: (existing?.uses ?? 0) + 1,
  };
}

/** Replace the template fit sentences with Gemini-written ones where available. */
export async function writeSummaries(options: TripOption[], people: Person[]): Promise<TripOption[]> {
  if (!isAIConfigured()) return options;
  try {
    const sentences = await summariesWithAI(options, people);
    return options.map((o) => ({
      ...o,
      fits: o.fits.map((f) => ({ ...f, summary: sentences.get(`${o.id}:${f.memberId}`) ?? f.summary })),
    }));
  } catch (e) {
    console.error("[planner] Gemini summaries failed, keeping template sentences:", e);
    return options;
  }
}

