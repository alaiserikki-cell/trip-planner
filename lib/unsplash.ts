import type { Photo } from "./types";

const APP_NAME = "group_trip_decider";

/** One landscape cover photo for a destination, or null (the card falls back to a gradient). */
export async function coverPhoto(query: string, opts: { revalidate?: number } = {}): Promise<Photo | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?${new URLSearchParams({
      query,
      per_page: "1",
      orientation: "landscape",
      content_filter: "high",
    })}`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : {}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.results?.[0];
    if (!p) return null;
    // Unsplash API guidelines: register the use of the photo via download_location.
    if (p.links?.download_location) {
      fetch(p.links.download_location, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {});
    }
    const utm = `?utm_source=${APP_NAME}&utm_medium=referral`;
    return {
      url: p.urls.regular,
      thumb: p.urls.small,
      credit: p.user?.name ?? "Unsplash",
      creditUrl: `${p.user?.links?.html ?? "https://unsplash.com"}${utm}`,
      color: p.color ?? null,
    };
  } catch {
    return null;
  }
}
