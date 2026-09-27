"use client";

import type { TripView } from "./types";

// Who this browser is, per trip. localStorage can throw (private mode, blocked
// storage), so every access is guarded and the app still renders without it.
const memberKey = (tripId: string) => `trip:${tripId}:member`;
const orgKey = (tripId: string) => `trip:${tripId}:organiser`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export interface Identity {
  memberId: string | null;
  token: string | null;
  organiserKey: string | null;
}

export function getIdentity(tripId: string): Identity {
  const raw = read(memberKey(tripId));
  let memberId: string | null = null;
  let token: string | null = null;
  if (raw) {
    try {
      ({ memberId, token } = JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return { memberId, token, organiserKey: read(orgKey(tripId)) };
}

export function saveMember(tripId: string, memberId: string, token: string) {
  write(memberKey(tripId), JSON.stringify({ memberId, token }));
}
export function forgetMember(tripId: string) {
  write(memberKey(tripId), null);
}
export function saveOrganiserKey(tripId: string, key: string) {
  write(orgKey(tripId), key);
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = { ok: true }>(path: string, id: Identity | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (id?.token) headers["x-member-token"] = id.token;
  if (id?.organiserKey) headers["x-organiser-key"] = id.organiserKey;
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Something went wrong (${res.status})`, res.status, data);
  return data as T;
}

export const fetchTrip = (tripId: string, id: Identity) => api<TripView>(`/api/trips/${tripId}`, id);

export function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function inrRange(low: number, high: number): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`);
  return `₹${k(low)}–${k(high)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
