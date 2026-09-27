"use client";

import { useEffect, useState } from "react";
import { api, storedTrips } from "@/lib/client";
import type { MyTrip } from "@/lib/types";

/** Trips this phone or browser started or joined. `null` while loading. */
export function useMyTrips() {
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

  return {
    trips,
    error,
    active: trips?.filter((t) => t.status !== "locked") ?? [],
    previous: trips?.filter((t) => t.status === "locked") ?? [],
  };
}
