"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Lock, Scale } from "lucide-react";
import OptionCard, { VOTE_LABEL } from "./OptionCard";
import Tracker from "./Tracker";
import { Notice, Toggle } from "./ui";
import { ApiError, api, type Identity } from "@/lib/client";
import { RANKING_NOTE } from "@/lib/constraints";
import { prettyRange } from "@/lib/dates";
import type { RoundView, TripView, VoteChoice } from "@/lib/types";

export default function OptionsBoard({
  view,
  identity,
  url,
  refresh,
}: {
  view: TripView;
  identity: Identity;
  url: string;
  refresh: () => Promise<void>;
}) {
  const { trip, members, me, isOrganiser } = view;
  const current = view.rounds.find((r) => r.round === trip.round);
  const earlier = view.rounds.filter((r) => r.round < trip.round);
  const [confirm, setConfirm] = useState<{ optionId: string; destination: string; leftOut: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!current) return null;
  const closed = current.votes.closed;
  const deciding = trip.status === "deciding";
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

  const vote = async (optionId: string, choice: VoteChoice, reason: string, changeReason?: string) => {
    await api(`/api/trips/${trip.id}/vote`, identity, { optionId, choice, reason, changeReason });
    await refresh();
  };

  const lock = async (optionId: string, confirmLeftOut = false) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/trips/${trip.id}/lock`, identity, { optionId, confirmLeftOut });
      setConfirm(null);
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.data.needsConfirm) {
        const o = current.options.find((x) => x.id === optionId)!;
        setConfirm({ optionId, destination: o.destination, leftOut: e.data.leftOut as string[] });
      } else setError(e instanceof Error ? e.message : "Couldn't lock the trip");
    } finally {
      setBusy(false);
    }
  };

  const closeVoting = async () => {
    if (!window.confirm("Close voting now? Anyone who hasn't voted won't be counted.")) return;
    try {
      await api(`/api/trips/${trip.id}/close-voting`, identity, {});
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't close voting");
    }
  };

  const noneClean = deciding && view.cleanOptionIds.length === 0;
  const myVotesDone = current.options.every((o) => current.votes.myVotes[o.id]);
  const myFitPrivate = me?.preferences?.fitPrivate ?? false;

  const setPrivacy = async (fitPrivate: boolean) => {
    setError(null);
    try {
      await api(`/api/trips/${trip.id}/privacy`, identity, { fitPrivate });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change your privacy setting");
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-brand">{trip.round > 1 ? "Round 2 · new options" : "Your options"}</p>
          <h2 className="font-display text-2xl font-bold">
            {deciding ? (noneClean ? "No option works for everyone yet" : "Votes are in") : "Three trips that could work"}
          </h2>
        </div>
        <p className="flex gap-2 text-sm text-muted">
          <Scale size={16} className="mt-0.5 shrink-0" /> {RANKING_NOTE}
        </p>

        {trip.round > 1 && !deciding && (
          <Notice>Round 1 didn&apos;t work for everyone, so these three are new, built from the votes and the reasons people gave.</Notice>
        )}

        {current.unmet.map((u) => (
          <Notice key={u.memberId} tone="warn">
            <span className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {u.text}
            </span>
          </Notice>
        ))}

        {current.exclusions.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <p className="mb-1 font-semibold">Ruled out for everyone</p>
            <ul className="space-y-0.5 text-muted">
              {current.exclusions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}

        {me?.preferences && (
          <Toggle
            label="Hide where I stand on each option"
            hint={myFitPrivate ? "The group sees that you keep your fit private. Only you see your row." : "Everyone can see your row. Turn this on to keep it to yourself."}
            checked={myFitPrivate}
            onChange={setPrivacy}
          />
        )}

        {!closed && (
          <Notice>
            {current.votes.finishedCount} of {current.votes.participantIds.length} have voted on every option.{" "}
            {myVotesDone ? "Votes stay hidden until everyone's in." : "Vote on each option below."}
          </Notice>
        )}
      </header>

      {view.blocker && (
        <div className="card border-bad/40 p-5">
          <p className="font-display text-lg font-bold">What&apos;s blocking the most popular option</p>
          <p className="mt-1 text-sm text-muted">
            {current.options.find((o) => o.id === view.blocker!.optionId)?.destination} has the most support. Here&apos;s exactly what stands in the way:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {view.blocker.lines.map((l) => (
              <li key={l} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" /> {l}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Talk it through: change the dates, or go without someone.{isOrganiser ? " You can still lock it below and it will show who's left out." : ""}
          </p>
        </div>
      )}

      {error && <Notice tone="bad">{error}</Notice>}

      {current.options.map((o) => {
        const isClean = view.cleanOptionIds.includes(o.id);
        const optionVotes = current.votes.all?.filter((v) => v.optionId === o.id) ?? null;
        return (
          <OptionCard
            key={o.id}
            option={o}
            members={members}
            meId={me?.memberId ?? null}
            canVote={!!me && (!closed || !!current.votes.myVotes[o.id])}
            closed={closed}
            myVote={current.votes.myVotes[o.id]}
            allVotes={optionVotes}
            onVote={(c, r, cr) => vote(o.id, c, r, cr)}
            highlight={view.blocker?.optionId === o.id}
            stats={current.stats[o.id]}
            myFitPrivate={myFitPrivate}
            footer={
              isOrganiser && deciding ? (
                <button
                  disabled={busy}
                  onClick={() => (isClean ? setConfirm({ optionId: o.id, destination: o.destination, leftOut: [] }) : lock(o.id))}
                  className={`btn w-full py-4 text-base ${isClean ? "btn-primary" : "btn-ghost"}`}
                >
                  <Lock size={18} /> {isClean ? `Lock ${o.destination}` : `Lock anyway (someone is out)`}
                </button>
              ) : null
            }
          />
        );
      })}

      {current.changes.length > 0 && (
        <div className="card p-5">
          <p className="mb-2 font-semibold">Vote changes after voting closed</p>
          <ul className="space-y-2 text-sm">
            {current.changes.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{nameOf(c.memberId)}</span> changed {current.options.find((o) => o.id === c.optionId)?.destination} from “
                {VOTE_LABEL[c.fromChoice]}” to “{VOTE_LABEL[c.toChoice]}”: <span className="text-muted">“{c.reason}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOrganiser && !closed && (
        <div className="space-y-3">
          <Tracker
            mode="vote"
            members={members}
            participantIds={current.votes.participantIds}
            tripName={trip.name}
            url={url}
            deadline={trip.deadline}
            onReset={async () => {}}
          />
          <button onClick={closeVoting} className="btn btn-ghost w-full py-3 text-sm">
            Close voting now
          </button>
        </div>
      )}

      {earlier.map((r) => (
        <EarlierRound key={r.round} round={r} />
      ))}

      {confirm && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setConfirm(null)}>
          <div className="card rise w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl font-bold">Lock {confirm.destination}?</p>
            {confirm.leftOut.length ? (
              <p className="mt-2 text-muted">
                <span className="font-semibold text-bad">{confirm.leftOut.join(", ")}</span> voted I&apos;m out. Locking means going without{" "}
                {confirm.leftOut.length === 1 ? "them" : "them all"}, and the trip card will say so.
              </p>
            ) : (
              <p className="mt-2 text-muted">Nobody voted I&apos;m out. This makes it official for the whole group.</p>
            )}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(null)} className="btn btn-ghost px-5 py-3.5">
                Not yet
              </button>
              <button disabled={busy} onClick={() => lock(confirm.optionId, true)} className="btn btn-primary flex-1 py-3.5">
                <Lock size={16} /> {busy ? "Locking…" : "Lock the trip"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EarlierRound({ round }: { round: RoundView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="font-semibold">Round {round.round} options</span>
        <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-3 space-y-2 text-sm">
          {round.options.map((o) => {
            const vs = round.votes.all?.filter((v) => v.optionId === o.id) ?? [];
            const n = (c: VoteChoice) => vs.filter((v) => v.choice === c).length;
            return (
              <li key={o.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium">{o.destination}</span> <span className="text-muted">· {prettyRange(o.startDate, o.endDate)}</span>
                </span>
                <span className="shrink-0 text-muted">
                  {n("in")} in · {n("maybe")} maybe · {n("out")} out
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
