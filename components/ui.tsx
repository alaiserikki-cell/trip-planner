import type { Marker } from "@/lib/types";

const MARKER_BG: Record<Marker, string> = { green: "bg-ok", amber: "bg-warn", red: "bg-bad" };

export function Dot({ marker, label }: { marker: Marker; label: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${MARKER_BG[marker]}`}
      title={label}
      aria-label={label}
      role="img"
    />
  );
}

const AVATAR_COLORS = ["#ff5a2c", "#0f766e", "#7c3aed", "#d4920a", "#2563eb", "#db2777", "#15965a", "#1a1712"];

export function Avatar({ name, index, size = 32, dim = false }: { name: string; index: number; size?: number; dim?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: AVATAR_COLORS[index % AVATAR_COLORS.length],
        opacity: dim ? 0.35 : 1,
      }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-xl font-bold">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "bad" | "ok"; children: React.ReactNode }) {
  const cls = {
    neutral: "bg-sunk text-ink",
    warn: "bg-warn-soft text-[#7a5406]",
    bad: "bg-bad-soft text-[#8f2716]",
    ok: "bg-ok-soft text-[#0c5e37]",
  }[tone];
  return <div className={`rounded-2xl px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export const ESTIMATE_LABEL = "Estimate. Check prices before booking.";

/** An on/off switch with a label and a one-line explanation. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-2xl bg-sunk px-4 py-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-6 w-11 shrink-0 rounded-full bg-line transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
  );
}
