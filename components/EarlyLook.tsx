"use client";

import { Sparkles } from "lucide-react";
import OptionCard from "./OptionCard";
import { Notice } from "./ui";
import type { TripView } from "@/lib/types";

// Options planned from whoever has answered so far. Read-only: voting starts
// when the organiser opens it (or at the deadline), so nobody votes on a moving target.
export default function EarlyLook({ view }: { view: TripView }) {
  const submitted = view.members.filter((m) => m.submitted).length;
  if (submitted < 1) return null;
  const round = view.rounds.find((r) => r.round === 0);

  if (!round) {
    return (
      <div className="card rise p-6 text-center">
        <Sparkles className="drift mx-auto text-brand" size={28} />
        <p className="font-display mt-3 text-xl font-bold">Planning your early look…</p>
        <p className="mt-1 text-sm text-muted">Trip ideas based on the answers so far will be here in about a minute.</p>
      </div>
    );
  }

  return (
    <section className="space-y-4 pt-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Early look</p>
        <h2 className="font-display mt-1 text-3xl font-bold">
          Trips that could <em className="text-gradient pr-1">work</em>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {round.votes.participantIds.length === 1 && round.votes.participantIds[0] === view.me?.memberId
            ? "Based on your answers so far. These change as friends answer, until the vote starts."
            : `Based on ${round.votes.participantIds.length} of ${view.members.length} people so far. These change as more people answer, until the vote starts.`}
        </p>
      </div>
      {view.previewUpdating && <Notice>Updating to include the latest answers…</Notice>}
      {round.options.map((o) => (
        <OptionCard
          key={o.id}
          option={o}
          members={view.members}
          meId={view.me?.memberId ?? null}
          canVote={false}
          closed={false}
          myVote={undefined}
          allVotes={null}
          onVote={async () => {}}
          stats={round.stats[o.id]}
          myFitPrivate={view.me?.preferences?.fitPrivate ?? false}
        />
      ))}
    </section>
  );
}
