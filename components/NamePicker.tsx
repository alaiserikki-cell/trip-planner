"use client";

import { useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Notice } from "./ui";

// What a friend sees when they open the shared link: just their name, then in.
export default function NamePicker({
  tripName,
  organiserName,
  onJoin,
}: {
  tripName: string;
  organiserName: string | undefined;
  onJoin: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onJoin(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join the trip");
      setBusy(false);
    }
  };

  return (
    <div className="rise flex min-h-[70svh] flex-col justify-center space-y-6">
      <div className="text-center">
        {organiserName && <p className="text-sm text-muted">{organiserName} invited you to</p>}
        <h1 className="font-display mt-1 text-4xl font-bold sm:text-5xl">{tripName}</h1>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <label htmlFor="join-name" className="block font-display text-2xl font-bold">
          What&apos;s your <em className="text-gradient pr-1">name?</em>
        </label>
        <input
          id="join-name"
          className="field"
          placeholder="Your name"
          value={name}
          maxLength={30}
          autoFocus
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
        />
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" disabled={!name.trim() || busy} className="btn btn-primary w-full py-4 text-base">
          {busy ? "Joining…" : (
            <>
              Join the trip <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
        <Lock size={12} /> Your answers are private. Nobody else can see them.
      </p>
    </div>
  );
}
