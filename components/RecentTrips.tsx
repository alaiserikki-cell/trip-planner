"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import TripList from "./TripList";
import { useMyTrips } from "@/hooks/useMyTrips";

const SHOW = 3;

// Home-page section: the trips on this device, so people can pick up where they
// left off. Renders nothing until there's at least one trip.
export default function RecentTrips() {
  const { trips, active, previous } = useMyTrips();
  if (!trips || trips.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-xl px-4 pt-16">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl font-bold">
          Your <em className="text-gradient pr-1">trips</em>
        </h2>
        <Link href="/trips" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
          See all <ArrowRight size={15} />
        </Link>
      </div>
      <div className="mt-6 space-y-8">
        {active.length > 0 && <TripList title="In progress" trips={active.slice(0, SHOW)} total={active.length} />}
        {previous.length > 0 && <TripList title="Previous trips" trips={previous.slice(0, SHOW)} total={previous.length} />}
      </div>
    </section>
  );
}
