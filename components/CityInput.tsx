"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { INDIAN_CITIES } from "@/lib/places";

export default function CityInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q
    ? INDIAN_CITIES.filter((c) => c.name.toLowerCase().startsWith(q) && c.name.toLowerCase() !== q).slice(0, 5)
    : [];

  return (
    <div className="relative">
      <div className="relative">
        <MapPin size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="field pl-10"
          placeholder="e.g. Pune"
          value={value}
          maxLength={60}
          autoComplete="address-level2"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
        />
      </div>
      {focused && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {matches.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.name);
                  setFocused(false);
                }}
                className="w-full px-4 py-3 text-left text-sm hover:bg-sunk"
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!q && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["Mumbai", "Delhi", "Bengaluru", "Pune", "Hyderabad", "Chennai"].map((c) => (
            <button key={c} type="button" className="chip px-3 py-1.5 text-xs" onClick={() => onChange(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
