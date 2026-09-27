"use client";

import { eachDate, isWeekendish, monthLabel, parseDate } from "@/lib/dates";

type Marks = Record<string, "available" | "maybe">;

const NEXT: Record<string, "available" | "maybe" | undefined> = { none: "available", available: "maybe", maybe: undefined };

export default function DateGrid({ start, end, value, onChange }: { start: string; end: string; value: Marks; onChange: (v: Marks) => void }) {
  const all = eachDate(start, end);

  // Group into months, each padded so weeks start on Monday.
  const months: { key: string; label: string; cells: (string | null)[] }[] = [];
  for (const d of all) {
    const date = parseDate(d);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    let m = months.find((x) => x.key === key);
    if (!m) {
      const lead = (date.getUTCDay() + 6) % 7;
      m = { key, label: monthLabel(date.getUTCFullYear(), date.getUTCMonth()), cells: Array(lead).fill(null) };
      months.push(m);
    }
    m.cells.push(d);
  }

  const cycle = (d: string) => {
    const next = { ...value };
    const n = NEXT[value[d] ?? "none"];
    if (n) next[d] = n;
    else delete next[d];
    onChange(next);
  };

  const setMany = (dates: string[], mark: "available" | null) => {
    const next = { ...value };
    for (const d of dates) {
      if (mark) next[d] = mark;
      else delete next[d];
    }
    onChange(next);
  };

  const avail = Object.values(value).filter((v) => v === "available").length;
  const maybe = Object.values(value).filter((v) => v === "maybe").length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="chip px-3 py-1.5 text-xs" onClick={() => setMany(all.filter(isWeekendish), "available")}>
          Fri–Sun free
        </button>
        <button type="button" className="chip px-3 py-1.5 text-xs" onClick={() => setMany(all, "available")}>
          All free
        </button>
        <button type="button" className="chip px-3 py-1.5 text-xs" onClick={() => setMany(all, null)}>
          Clear
        </button>
      </div>
      <div className="max-h-[420px] space-y-5 overflow-y-auto rounded-2xl border border-line bg-surface p-3">
        {months.map((m) => (
          <div key={m.key}>
            <p className="mb-2 px-1 text-sm font-semibold">{m.label}</p>
            <div className="grid grid-cols-7 gap-1 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="pb-1 text-[11px] font-medium text-muted">
                  {d}
                </span>
              ))}
              {m.cells.map((d, i) => {
                if (!d) return <span key={`pad-${i}`} />;
                const mark = value[d];
                const cls =
                  mark === "available"
                    ? "bg-ok text-white"
                    : mark === "maybe"
                      ? "bg-warn-soft text-[#7a5406] ring-1 ring-inset ring-warn"
                      : "bg-sunk text-muted";
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => cycle(d)}
                    className={`aspect-square rounded-lg text-sm font-medium transition active:scale-90 ${cls}`}
                    aria-label={`${d}: ${mark ?? "no"}`}
                  >
                    {parseDate(d).getUTCDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-ok" /> Available</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-warn" /> Maybe</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-sunk ring-1 ring-line" /> No</span>
        </span>
        <span>
          {avail} free · {maybe} maybe
        </span>
      </div>
    </div>
  );
}
