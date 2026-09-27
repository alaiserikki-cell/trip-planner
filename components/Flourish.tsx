// Small decorative pieces used on the landing page and the lock moment.

/** Text set along a gentle arc, e.g. above the hero headline. */
export function CurvedText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <svg viewBox="0 0 400 90" className={`overflow-visible ${className}`} aria-label={children} role="img">
      <path id="curve" d="M 10 85 Q 200 -15 390 85" fill="none" />
      <text fontSize="17" fontWeight="600" letterSpacing="2.5" fill="currentColor" style={{ textTransform: "uppercase" }}>
        <textPath href="#curve" startOffset="50%" textAnchor="middle">
          {children}
        </textPath>
      </text>
    </svg>
  );
}

/** A hand-drawn brush underline under a phrase. */
export function Underline({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full" aria-hidden>
        <path d="M2 8 C 40 2, 80 2, 110 6 S 170 11, 198 4" fill="none" stroke="var(--brand)" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** The wordmark: serif with an italic, gradient "it." */
export function Wordmark({ className = "", light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`font-display font-bold ${light ? "text-white" : "text-ink"} ${className}`}>
      Plan <em className="text-gradient pr-1">it.</em>
    </span>
  );
}
