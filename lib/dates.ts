// All trip dates are calendar dates (YYYY-MM-DD) with no time zone attached.
// Work in UTC so a date never shifts by a day depending on the server's zone.

export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const date = parseDate(d);
  date.setUTCDate(date.getUTCDate() + n);
  return formatISO(date);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWeekendish(d: string): boolean {
  // Fri, Sat, Sun — what most people mean by "a weekend trip".
  const dow = parseDate(d).getUTCDay();
  return dow === 5 || dow === 6 || dow === 0;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function prettyDate(d: string, withDow = false): string {
  const date = parseDate(d);
  const s = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withDow ? `${DOW[date.getUTCDay()]} ${s}` : s;
}

export function prettyRange(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${DOW[a.getUTCDay()]} ${a.getUTCDate()} – ${DOW[b.getUTCDay()]} ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  }
  return `${prettyDate(start, true)} – ${prettyDate(end, true)}`;
}

export function monthLabel(year: number, month: number): string {
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month]} ${year}`;
}

export function monthOf(d: string): number {
  return parseDate(d).getUTCMonth() + 1;
}

export function prettyDeadline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeLeft(iso: string, nowIso: string): string {
  const ms = new Date(iso).getTime() - new Date(nowIso).getTime();
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

/** "14 Oct – 12 Jan", for long spans like the travel window. */
export function prettySpan(start: string, end: string): string {
  return `${prettyDate(start)} – ${prettyDate(end)}`;
}
