import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prettyDeadline, prettyRange, prettySpan } from "@/lib/dates";
import type { MyTrip } from "@/lib/types";

function statusLine(t: MyTrip): string {
  switch (t.status) {
    case "collecting":
      return `Answering · ${t.answered} of ${t.people} done · due ${prettyDeadline(t.deadline)}`;
    case "generating":
      return "Planning the options";
    case "voting":
      return "Voting is open";
    case "deciding":
      return "Votes are in · waiting for the organiser to lock";
    case "locked":
      return t.locked ? `${t.locked.destination} · ${prettyRange(t.locked.startDate, t.locked.endDate)}` : "Locked";
  }
}

/** A titled list of trips, each linking to its page. `total` shows the full count when the list is trimmed. */
export default function TripList({ title, trips, total }: { title: string; trips: MyTrip[]; total?: number }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
        {title} · {total ?? trips.length}
      </h2>
      <ul className="space-y-3">
        {trips.map((t) => (
          <li key={t.id}>
            <Link href={`/t/${t.id}`} className="card flex items-center gap-4 p-5 transition hover:border-brand">
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-xl font-bold">{t.name}</p>
                <p className={`mt-1 text-sm ${t.status === "locked" ? "font-medium text-ink" : "text-muted"}`}>{statusLine(t)}</p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{t.isOrganiser ? "You organised this" : t.myName ? `You joined as ${t.myName}` : "Joined"}</span>
                  <span>
                    {t.people} {t.people === 1 ? "person" : "people"}
                  </span>
                  {t.status !== "locked" && <span>{prettySpan(t.windowStart, t.windowEnd)}</span>}
                </p>
              </div>
              <ArrowRight size={18} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
