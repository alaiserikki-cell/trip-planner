"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, saveMember, saveOrganiserKey } from "@/lib/client";
import { addDays, todayISO } from "@/lib/dates";
import { TRIP_LENGTHS, TRIP_LENGTH_LABEL, type TripLength } from "@/lib/types";

const DEADLINES = [
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

export default function CreateTripForm() {
  const router = useRouter();
  const today = todayISO();
  const [name, setName] = useState("");
  const [you, setYou] = useState("");
  const [start, setStart] = useState(addDays(today, 14));
  const [end, setEnd] = useState(addDays(today, 104));
  const [length, setLength] = useState<TripLength>("2-3");
  const [deadlineHours, setDeadlineHours] = useState(48);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() && you.trim() && start && end && end >= start && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ tripId: string; organiserKey: string; memberId: string; token: string }>("/api/trips", null, {
        name,
        organiserName: you,
        windowStart: start,
        windowEnd: end,
        tripLength: length,
        deadline: new Date(Date.now() + deadlineHours * 3_600_000).toISOString(),
      });
      saveOrganiserKey(res.tripId, res.organiserKey);
      saveMember(res.tripId, res.memberId, res.token);
      router.push(`/t/${res.tripId}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the trip");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-6 p-5 sm:p-7">
      <Field label="Trip name">
        <input className="field" placeholder="College gang trip" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>

      <Field label="Your name" hint="Friends add their own names from the link">
        <input className="field" placeholder="Your name" value={you} onChange={(e) => setYou(e.target.value)} maxLength={30} />
      </Field>

      <Field label="Travel window" hint="Any dates in this range could work">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            From
            <input type="date" className="field mt-1" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-xs text-muted">
            To
            <input type="date" className="field mt-1" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
      </Field>

      <Field label="Trip length">
        <Segmented options={TRIP_LENGTHS.map((l) => ({ value: l, label: TRIP_LENGTH_LABEL[l] }))} value={length} onChange={setLength} />
      </Field>

      <Field label="Everyone answers within">
        <Segmented options={DEADLINES.map((d) => ({ value: d.hours, label: d.label }))} value={deadlineHours} onChange={setDeadlineHours} />
      </Field>

      {error && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

      <button type="submit" disabled={!canSubmit} className="btn btn-primary w-full py-4 text-base">
        {busy ? "Creating…" : "Create trip & get the link"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-sunk p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-2 py-2.5 text-sm font-medium transition ${
            o.value === value ? "bg-surface text-ink shadow-sm" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
