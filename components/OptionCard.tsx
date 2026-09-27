"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Lock as LockIcon, TrainFront, Plane, Car } from "lucide-react";
import { Avatar, Dot, ESTIMATE_LABEL } from "./ui";
import { inrRange } from "@/lib/client";
import { prettyRange } from "@/lib/dates";
import type { Fit, Marker, MemberView, TravelMode, TripOption, VoteChoice } from "@/lib/types";

export const VOTE_LABEL: Record<VoteChoice, string> = { in: "I'm in", maybe: "I'd go if needed", out: "I'm out" };
const VOTE_SHORT: Record<VoteChoice, string> = { in: "In", maybe: "If needed", out: "Out" };

const MODE_ICON: Record<TravelMode, typeof Plane> = { Flight: Plane, Train: TrainFront, "Road trip": Car };

function overall(f: Fit): Marker {
  const ms = [f.dates, f.budget, f.tripType, f.travel];
  return ms.includes("red") ? "red" : ms.includes("amber") ? "amber" : "green";
}

/** "Karan: within their budget" → "Within your budget", for the viewer's own box. */
function toSecondPerson(summary: string): string {
  return summary
    .replace(/^[^:]+:\s*/, "")
    .replace(/\btheir\b/gi, "your")
    .replace(/\bthey\b/gi, "you")
    .replace(/\bthem\b/gi, "you")
    .replace(/^./, (c) => c.toUpperCase());
}

const RING: Record<Marker, string> = { green: "ring-ok", amber: "ring-warn", red: "ring-bad" };

export function groupCost(option: TripOption, memberIds?: string[]) {
  const legs = option.travel.filter((t) => !memberIds || memberIds.includes(t.memberId));
  const lows = legs.map((t) => t.cost.low);
  const highs = legs.map((t) => t.cost.high);
  return {
    low: (lows.length ? Math.min(...lows) : 0) + option.stay.low + option.dailySpend.low,
    high: (highs.length ? Math.max(...highs) : 0) + option.stay.high + option.dailySpend.high,
  };
}

export function Cover({ option, className = "h-48" }: { option: TripOption; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: option.photo?.color ?? "#0f766e" }}>
      {option.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.photo.url} alt={option.destination} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#ff8a5c,transparent_55%),radial-gradient(circle_at_80%_70%,#0f766e,transparent_60%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
    </div>
  );
}

export default function OptionCard({
  option,
  members,
  meId,
  canVote,
  closed,
  myVote,
  allVotes,
  onVote,
  footer,
  highlight,
  stats,
  myFitPrivate,
}: {
  option: TripOption;
  members: MemberView[];
  meId: string | null;
  canVote: boolean;
  closed: boolean;
  myVote: { choice: VoteChoice; reason: string } | undefined;
  allVotes: { memberId: string; choice: VoteChoice; reason: string }[] | null;
  onVote: (choice: VoteChoice, reason: string, changeReason?: string) => Promise<void>;
  footer?: React.ReactNode;
  highlight?: boolean;
  stats?: { groupScore: number; limitsBroken: number; worksWell: number; total: number };
  myFitPrivate?: boolean;
}) {
  const [pending, setPending] = useState<VoteChoice | null>(null);
  const [reason, setReason] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myFit = option.fits.find((f) => f.memberId === meId && f.submitted);
  const myLeg = option.travel.find((t) => t.memberId === meId);
  const mine = myFit ? groupCost(option, [meId!]) : null;
  const group = groupCost(option);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
  const indexOf = (id: string) => members.findIndex((m) => m.id === id);

  const choose = async (c: VoteChoice) => {
    setError(null);
    if (c === "out" || closed) {
      setPending(c);
      setReason(c === "out" ? (myVote?.choice === "out" ? myVote.reason : "") : "");
      return;
    }
    await send(c, "");
  };

  const send = async (c: VoteChoice, r: string, cr?: string) => {
    setBusy(true);
    try {
      await onVote(c, r, cr);
      setPending(null);
      setChangeReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your vote");
    } finally {
      setBusy(false);
    }
  };

  const tally = (c: VoteChoice) => allVotes?.filter((v) => v.choice === c).length ?? 0;

  return (
    <article className={`card rise overflow-hidden ${highlight ? "ring-2 ring-brand" : ""}`}>
      <div className="relative">
        <Cover option={option} />
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink">#{option.rank}</span>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <p className="text-xs font-medium uppercase tracking-wider opacity-85">{option.region}</p>
          <h3 className="font-display text-3xl font-bold leading-tight">{option.destination}</h3>
          <p className="mt-0.5 text-sm font-medium opacity-95">{prettyRange(option.startDate, option.endDate)} · {option.days.length} days</p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Five-second read: how it works for everyone, and for you. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex -space-x-1.5">
            {option.fits.map((f) => (
              <span key={f.memberId} className={`rounded-full ring-2 ${f.submitted && !f.hidden ? RING[overall(f)] : "ring-line"}`}>
                <Avatar name={nameOf(f.memberId)} index={indexOf(f.memberId)} size={28} dim={!f.submitted} />
              </span>
            ))}
          </div>
          {stats && (
            <>
              <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-deep">Group fit {stats.groupScore}%</span>
              {stats.limitsBroken === 0 ? (
                <span className="flex items-center gap-1 text-sm font-medium text-ok">
                  <Check size={15} strokeWidth={3} /> Everyone&apos;s limits met
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-medium text-bad">
                  <AlertTriangle size={15} /> Breaks {stats.limitsBroken} {stats.limitsBroken === 1 ? "person's" : "people's"} limits
                </span>
              )}
            </>
          )}
        </div>

        {myFit && (
          <div className="rounded-2xl bg-sunk p-4">
            <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
              For you
              {myFitPrivate && (
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  <LockIcon size={11} /> Hidden from the group
                </span>
              )}
            </p>
            <p className="mt-1 text-[15px] leading-snug">{toSecondPerson(myFit.summary)}</p>
            {mine && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">{inrRange(mine.low, mine.high)}</span> <span className="text-muted">all in · {myFit.budgetLabel === "Within" ? "within" : myFit.budgetLabel === "Stretch" ? "a stretch on" : "over"} your budget</span>
              </p>
            )}
          </div>
        )}

        <p className="text-[15px]">
          <span className="font-semibold">Why it made the list: </span>
          {option.why}
        </p>

        <div>
          <p className="mb-2 text-sm font-semibold">Where everyone stands</p>
          <ul className="space-y-2.5">
            {option.fits.map((f) => (
              <li key={f.memberId} className="flex gap-3">
                <Avatar name={nameOf(f.memberId)} index={indexOf(f.memberId)} size={26} dim={!f.submitted} />
                <div className="min-w-0 flex-1">
                  {f.hidden ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      <span className="font-medium text-ink">{nameOf(f.memberId)}</span> keeps where they stand private
                      <LockIcon size={12} />
                    </p>
                  ) : f.submitted ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Dot marker={f.dates} label="Dates" />
                        <Dot marker={f.budget} label={`Budget: ${f.budgetLabel}`} />
                        <Dot marker={f.tripType} label="Trip type" />
                        <Dot marker={f.travel} label="Travel" />
                        <span className="ml-1 text-xs text-muted">Budget: {f.budgetLabel}</span>
                      </div>
                      <p className="mt-0.5 text-sm leading-snug">{f.summary}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      <span className="font-medium text-ink">{nameOf(f.memberId)}</span>: No preferences submitted
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">Dots: dates · budget · trip type · travel</p>
        </div>

        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">Cost per person</p>
            <p className="font-display text-lg font-bold">{inrRange(group.low, group.high)}</p>
          </div>
          <p className="text-xs text-muted">Varies by starting city. {ESTIMATE_LABEL}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Stay" value={inrRange(option.stay.low, option.stay.high)} />
            <Row label="Daily spend" value={inrRange(option.dailySpend.low, option.dailySpend.high)} />
            <Row label="Travel (return)" value="depends on city ↓" muted />
          </dl>
        </div>

        <Details title="How everyone gets there">
          <ul className="space-y-2.5">
            {option.travel.map((t) => {
              const Icon = MODE_ICON[t.mode];
              return (
                <li key={t.memberId} className={`flex gap-3 text-sm ${t.memberId === meId ? "font-medium" : ""}`}>
                  <Icon size={16} className="mt-0.5 shrink-0 text-muted" />
                  <div className="flex-1">
                    <p>
                      {nameOf(t.memberId)} · {t.route}
                    </p>
                    <p className="text-xs text-muted">
                      ~{t.durationHours < 1 ? "<1" : Math.round(t.durationHours)}h each way · {inrRange(t.cost.low, t.cost.high)} return (estimate)
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {myLeg && <p className="mt-3 text-xs text-muted">Your route is in bold.</p>}
        </Details>

        <Details title="Day by day">
          <ol className="space-y-1.5 text-sm">
            {option.days.map((d, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-12 shrink-0 font-semibold text-muted">Day {i + 1}</span>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </Details>

        {option.photo && (
          <p className="text-[11px] text-muted">
            Photo by{" "}
            <a href={option.photo.creditUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {option.photo.credit}
            </a>{" "}
            on{" "}
            <a href="https://unsplash.com/?utm_source=group_trip_decider&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline">
              Unsplash
            </a>
          </p>
        )}

        {/* Votes */}
        {allVotes && (
          <div className="rounded-2xl bg-sunk p-4">
            <p className="text-sm font-semibold">
              {tally("in")} in · {tally("maybe")} if needed · {tally("out")} out
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {allVotes.map((v) => (
                <li key={v.memberId}>
                  <span className="font-medium">{nameOf(v.memberId)}</span>{" "}
                  <span className={v.choice === "out" ? "text-bad" : v.choice === "in" ? "text-ok" : "text-[#7a5406]"}>{VOTE_SHORT[v.choice]}</span>
                  {v.choice === "out" && v.reason && <span className="text-muted"> — “{v.reason}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canVote && (
          <div>
            <p className="mb-2 text-sm font-semibold">{closed ? "Your vote (locked)" : "Your vote"}</p>
            <div className="grid grid-cols-3 gap-2">
              {(["in", "maybe", "out"] as VoteChoice[]).map((c) => {
                const active = (pending ?? myVote?.choice) === c;
                const tone = c === "in" ? "bg-ok border-ok" : c === "maybe" ? "bg-warn border-warn" : "bg-bad border-bad";
                return (
                  <button
                    key={c}
                    disabled={busy}
                    onClick={() => choose(c)}
                    className={`rounded-2xl border px-2 py-3 text-sm font-semibold transition active:scale-95 ${
                      active ? `${tone} text-white` : "border-line bg-surface"
                    }`}
                  >
                    {VOTE_LABEL[c]}
                  </button>
                );
              })}
            </div>
            {pending && (
              <div className="mt-3 space-y-2">
                {pending === "out" && (
                  <textarea
                    className="field min-h-20 resize-none text-sm"
                    placeholder="What would need to change? e.g. can't do those dates"
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                )}
                {closed && (
                  <textarea
                    className="field min-h-16 resize-none text-sm"
                    placeholder="Voting has closed. Why are you changing your vote? The group will see this."
                    value={changeReason}
                    maxLength={300}
                    onChange={(e) => setChangeReason(e.target.value)}
                  />
                )}
                <div className="flex gap-2">
                  <button onClick={() => setPending(null)} className="btn btn-ghost px-4 py-2.5 text-sm">
                    Cancel
                  </button>
                  <button
                    disabled={busy || (pending === "out" && reason.trim().length < 3) || (closed && changeReason.trim().length < 3)}
                    onClick={() => send(pending, pending === "out" ? reason : "", closed ? changeReason : undefined)}
                    className="btn btn-dark flex-1 py-2.5 text-sm"
                  >
                    {closed ? "Change my vote" : "Save"}
                  </button>
                </div>
                {pending === "out" && !closed && <p className="text-xs text-muted">Shared with the group once voting closes.</p>}
              </div>
            )}
            {error && <p className="mt-2 text-sm text-bad">{error}</p>}
            {!closed && myVote && !pending && <p className="mt-2 flex items-center gap-1 text-xs text-muted"><LockIcon size={11} /> Hidden from everyone until all votes are in.</p>}
          </div>
        )}

        {footer}
      </div>
    </article>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={muted ? "text-muted" : "font-medium"}>{value}</dd>
    </div>
  );
}

function Details({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
        {title}
        <ChevronDown size={16} className="transition group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
