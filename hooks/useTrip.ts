"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchTrip, type Identity } from "@/lib/client";
import type { TripView } from "@/lib/types";

export function useTrip(tripId: string, identity: Identity | null) {
  const [view, setView] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    if (!identity) return;
    try {
      setView(await fetchTrip(tripId, identity));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(e instanceof Error ? e.message : "Couldn't load the trip");
    }
  }, [tripId, identity]);

  const status = view?.trip.status;
  useEffect(() => {
    if (!identity) return;
    // Poll our API; setState happens in refresh()'s async continuation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Poll faster while something is actively changing.
    const ms = status === "generating" ? 2500 : status === "locked" ? 30000 : 5000;
    const t = setInterval(refresh, ms);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [identity, refresh, status]);

  return { view, error, notFound, refresh };
}
