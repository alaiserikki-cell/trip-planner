"use client";

import Link from "next/link";
import { ArrowRight, Lock, MapPin } from "lucide-react";
import { Wordmark } from "@/components/Flourish";
import TripList from "@/components/TripList";
import { Notice } from "@/components/ui";
import { useMyTrips } from "@/hooks/useMyTrips";

export default function MyTripsPage() {
  const { trips, error, active, previous } = useMyTrips();

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
        {previous.length > 0 && <TripList title="Previous trips" trips={previous} />}

        {trips && trips.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
            <Lock size={12} /> Trips show on the device you used to join them. Nobody else can see this list.
          </p>
        )}
      </div>
    </main>
  );
}
