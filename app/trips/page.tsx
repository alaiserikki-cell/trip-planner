"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Lock, MapPin } from "lucide-react";
import { Wordmark } from "@/components/Flourish";
import { Notice } from "@/components/ui";
import { api, storedTrips } from "@/lib/client";
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

export default function MyTripsPage() {
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = storedTrips();
    if (!stored.length) {
      // Nothing on this device; setState runs once after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrips([]);
      return;
    }
    api<{ trips: MyTrip[] }>("/api/trips/mine", null, { trips: stored })
      .then((r) => setTrips(r.trips))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your trips."));
  }, []);

  const active = trips?.filter((t) => t.status !== "locked") ?? [];
  const past = trips?.filter((t) => t.status === "locked") ?? [];

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Plan it home">
          <Wordmark className="text-xl" />
        </Link>
        <Link href="/#start" className="btn btn-primary px-4 py-2 text-sm">
          New trip
        </Link>
      </header>

      <h1 className="font-display mt-6 text-4xl font-bold">
        My <em className="text-gradient pr-1">trips</em>
      </h1>
      <p className="mt-1 text-sm text-muted">Trips you started or joined on this phone or browser.</p>

      <div className="mt-6 space-y-8">
        {error && <Notice tone="bad">{error}</Notice>}
        {!trips && !error && (
          <div className="space-y-3" aria-hidden>
            <div className="h-24 animate-pulse rounded-3xl bg-sunk" />
            <div className="h-24 animate-pulse rounded-3xl bg-sunk" />
          </div>
        )}

        {trips && trips.length === 0 && (
          <div className="card p-6 text-center">
            <MapPin className="mx-auto text-brand" size={28} />
            <p className="font-display mt-3 text-xl font-bold">No trips on this device yet</p>
            <p className="mt-1 text-sm text-muted">Start one, or open a trip link a friend sent you.</p>
            <Link href="/#start" className="btn btn-primary mt-5 px-5 py-3 text-sm">
              Start a trip <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {active.length > 0 && <TripList title="In progress" trips={active} />}
        {past.length > 0 && <TripList title="Past trips" trips={past} />}

        {trips && trips.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <Lock size={12} /> Trips show on the device you used to join them. Nobody else can see this list.
          </p>
        )}
      </div>
    </main>
  );
}

function TripList({ title, trips }: { title: string; trips: MyTrip[] }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
        {title} · {trips.length}
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
