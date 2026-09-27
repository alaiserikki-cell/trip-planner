"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import CityInput from "./CityInput";
import DateGrid from "./DateGrid";
import { Segmented } from "./CreateTripForm";
import { Notice, Toggle } from "./ui";
import { inr } from "@/lib/client";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DEAL_BREAKERS,
  TRAVEL_MODES,
  TRIP_TYPES,
  type Firmness,
  type Preferences,
  type TravelMode,
  type Trip,
  type TripType,
} from "@/lib/types";

export type PreferenceInput = Omit<Preferences, "memberId" | "tripId" | "updatedAt">;

const TYPE_EMOJI: Record<TripType, string> = {
  Beach: "🏖️",
  Mountains: "🏔️",
  "City & food": "🍜",
  Adventure: "🧗",
  "Culture & heritage": "🏛️",
  "Just relax": "🛋️",
};

export default function PreferenceForm({
  trip,
  initial,
  onSubmit,
  onCancel,
}: {
  trip: Pick<Trip, "windowStart" | "windowEnd">;
  initial: Preferences | null;
  onSubmit: (p: PreferenceInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [city, setCity] = useState(initial?.startingCity ?? "");
  const [dates, setDates] = useState<Preferences["dates"]>(initial?.dates ?? {});
  const [budget, setBudget] = useState(initial?.budget ?? 20000);
  const [firmness, setFirmness] = useState<Firmness | null>(initial?.firmness ?? null);
  const [types, setTypes] = useState<TripType[]>(initial?.tripTypes ?? []);
  const [modes, setModes] = useState<TravelMode[]>(initial?.travelModes ?? []);
  const [breakers, setBreakers] = useState<string[]>(initial?.dealBreakers ?? []);
  const [other, setOther] = useState(initial?.dealBreakerOther ?? "");
  const [anonymous, setAnonymous] = useState(initial?.anonymousDealBreakers ?? false);
  const [fitPrivate, setFitPrivate] = useState(initial?.fitPrivate ?? false);
  const [great, setGreat] = useState(initial?.greatTrip ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T,>(list: T[], item: T, max = Infinity) =>
    list.includes(item) ? list.filter((x) => x !== item) : list.length >= max ? list : [...list, item];

  const missing = [
    !city.trim() && "your starting city",
    !firmness && "how firm your budget is",
    !types.length && "a trip type",
    !modes.length && "how you'll travel",
  ].filter(Boolean) as string[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) {
      setError(`Still need ${missing.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        startingCity: city.trim(),
        dates,
        budget,
        firmness: firmness!,
        tripTypes: types,
        travelModes: modes,
        dealBreakers: breakers,
        dealBreakerOther: other,
        anonymousDealBreakers: anonymous,
        fitPrivate,
        greatTrip: great,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your answers");
      setBusy(false);
    }
  };

  const fill = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const markedCount = Object.keys(dates).length;

  return (
    <form onSubmit={submit} className="rise space-y-4 pb-28">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Lock size={12} /> Only you see these answers. The group only sees things like “within budget”, never your numbers.
      </p>

      <Step n={1} title="Where are you starting from?">
        <CityInput value={city} onChange={setCity} />
      </Step>

      <Step n={2} title="Which dates can you do?" hint="Tap a date: free → maybe → no">
        <DateGrid start={trip.windowStart} end={trip.windowEnd} value={dates} onChange={setDates} />
      </Step>

      <Step n={3} title="Budget for the whole trip" hint="Per person, including travel and stay">
        <p className="font-display text-3xl font-bold">
          {inr(budget)}
          {budget >= BUDGET_MAX && "+"}
        </p>
        <input
          type="range"
          className="budget mt-4"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={500}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          style={{ ["--fill" as string]: `${fill}%` }}
          aria-label="Budget per person"
        />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>₹5k</span>
          <span>₹1L</span>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">How firm is that?</p>
          <Segmented
            options={[
              { value: "hard", label: "Hard limit" },
              { value: "stretch", label: "Can stretch a little" },
            ]}
            value={firmness ?? ("" as Firmness)}
            onChange={setFirmness}
          />
        </div>
      </Step>

      <Step n={4} title="What kind of trip?" hint="Up to 3, tap your favourite first">
        <div className="flex flex-wrap gap-2">
          {TRIP_TYPES.map((t) => {
            const idx = types.indexOf(t);
            return (
              <button
                key={t}
                type="button"
                className="chip"
                aria-pressed={idx >= 0}
                disabled={idx < 0 && types.length >= 3}
                onClick={() => setTypes((cur) => toggle(cur, t, 3))}
              >
                <span>{TYPE_EMOJI[t]}</span> {t}
                {idx >= 0 && <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-xs">{idx + 1}</span>}
              </button>
            );
          })}
        </div>
      </Step>

      <Step n={5} title="How are you happy to travel?">
        <div className="flex flex-wrap gap-2">
          {TRAVEL_MODES.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={modes.includes(m)} onClick={() => setModes((cur) => toggle(cur, m))}>
              {m === "Flight" ? "✈️" : m === "Train" ? "🚆" : "🚗"} {m}
            </button>
          ))}
        </div>
      </Step>

      <Step n={6} title="Any deal-breakers?" hint={anonymous ? "Shown to the group without your name" : "Shown to the group with your name"}>
        <div className="flex flex-wrap gap-2">
          {DEAL_BREAKERS.map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={breakers.includes(d)} onClick={() => setBreakers((cur) => toggle(cur, d))}>
              {d}
            </button>
          ))}
        </div>
        <input className="field mt-3" placeholder="Anything else? e.g. Not Goa again" value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} />
        <div className="mt-4">
          <Toggle
            label="Keep my deal-breakers anonymous"
            hint="The group sees “Someone in the group ruled out…” instead of your name."
            checked={anonymous}
            onChange={setAnonymous}
          />
        </div>
      </Step>

      <Step n={7} title="What would make this trip great for you?" hint="Optional, but it really helps">
        <textarea
          className="field min-h-24 resize-none"
          placeholder="Good food, one lazy day, no 5am starts…"
          value={great}
          maxLength={500}
          onChange={(e) => setGreat(e.target.value)}
        />
      </Step>

      <section className="card p-5">
        <h3 className="mb-3 font-semibold">Privacy</h3>
        <Toggle
          label="Hide where I stand on each option"
          hint="The group won't see your row (dates, budget, trip type, travel). You can change this any time."
          checked={fitPrivate}
          onChange={setFitPrivate}
        />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl space-y-2">
          {error && <Notice tone="bad">{error}</Notice>}
          {!error && markedCount === 0 && <p className="text-center text-xs text-muted">You haven&apos;t marked any dates as free yet.</p>}
          <div className="flex gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="btn btn-ghost px-5 py-4">
                Cancel
              </button>
            )}
            <button type="submit" disabled={busy} className="btn btn-primary flex-1 py-4 text-base">
              {busy ? "Saving…" : initial ? "Save changes" : "Submit my answers"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
          {n}
        </span>
        <div>
          <h3 className="font-semibold leading-7">{title}</h3>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
