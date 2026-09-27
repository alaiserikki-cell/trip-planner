"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Check, ChevronDown } from "lucide-react";
import { Cover, groupCost } from "./OptionCard";
import { WhatsAppIcon } from "./SharePanel";
import { Avatar, ESTIMATE_LABEL } from "./ui";
import { inrRange } from "@/lib/client";
import { prettyRange } from "@/lib/dates";
import type { TripView } from "@/lib/types";

export default function LockedTrip({ view }: { view: TripView }) {
  const lock = view.lock!;
  const option = view.rounds.flatMap((r) => r.options).find((o) => o.id === lock.optionId)!;
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState<number[]>([]);
  const storageKey = `trip:${view.trip.id}:checklist`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      // Per-viewer convenience only; hydrate after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setDone(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const inNames = view.members.filter((m) => lock.inMemberIds.includes(m.id));
  const outNames = view.members.filter((m) => lock.leftOutIds.includes(m.id));
  const cost = groupCost(option, lock.inMemberIds.length ? lock.inMemberIds : undefined);
  const text = `🔒 ${view.trip.name} is locked!\n📍 ${option.destination}, ${option.region}\n🗓️ ${prettyRange(option.startDate, option.endDate)}\n👥 ${inNames.map((m) => m.name).join(", ")}\n💸 ${inrRange(cost.low, cost.high)} per person (estimate, check prices before booking)`;

  const share = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${option.destination.replace(/\W+/g, "-").toLowerCase()}-trip.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        a.click();
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rise text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">It&apos;s happening</p>
        <h1 className="font-display mt-2 text-4xl font-bold">
          Pack your <em className="text-gradient pr-1">bags.</em>
        </h1>
      </div>

      <div ref={cardRef} className="rise relative overflow-hidden rounded-[1.75rem] bg-ink text-white shadow-xl" style={{ animationDelay: "120ms" }}>
        <Cover option={option} className="h-60" />
        <span className="stamp absolute right-4 top-4 rounded-lg border-[3px] border-white px-3 py-1 font-display text-lg font-bold uppercase tracking-widest">
          Locked
        </span>
        <div className="absolute inset-x-5 top-44">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">{view.trip.name}</p>
          <p className="font-display text-4xl font-bold leading-none">{option.destination}</p>
        </div>
        <div className="space-y-4 p-5 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-60">When</p>
              <p className="font-semibold">{prettyRange(option.startDate, option.endDate)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-60">Per person</p>
              <p className="font-semibold">{inrRange(cost.low, cost.high)}</p>
              <p className="text-[10px] opacity-60">{ESTIMATE_LABEL}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider opacity-60">Who&apos;s in</p>
            <div className="flex flex-wrap gap-2">
              {inNames.map((m) => (
                <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm">
                  <Avatar name={m.name} index={view.members.findIndex((x) => x.id === m.id)} size={22} />
                  {m.name}
                </span>
              ))}
            </div>
            {outNames.length > 0 && <p className="mt-2 text-xs opacity-60">Sitting this one out: {outNames.map((m) => m.name).join(", ")}</p>}
          </div>
        </div>
      </div>

      <button onClick={share} disabled={sharing} className="btn w-full py-4 text-base text-white" style={{ background: "#1faa53" }}>
        <WhatsAppIcon /> {sharing ? "Preparing image…" : "Share trip card"}
      </button>

      <section className="card p-5">
        <p className="font-display text-lg font-bold">Next steps</p>
        <p className="mb-3 text-sm text-muted">This app doesn&apos;t book anything. Here&apos;s what to sort out, in order.</p>
        <ul className="space-y-1">
          {lock.checklist.map((item, i) => (
            <li key={i}>
              <button onClick={() => toggle(i)} className="flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    done.includes(i) ? "border-ok bg-ok text-white" : "border-line"
                  }`}
                >
                  {done.includes(i) && <Check size={14} strokeWidth={3} />}
                </span>
                <span className={done.includes(i) ? "text-muted line-through" : ""}>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <details className="card group p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          The plan
          <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
        </summary>
        <ol className="mt-3 space-y-1.5 text-sm">
          {option.days.map((d, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-12 shrink-0 font-semibold text-muted">Day {i + 1}</span>
              <span>{d}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm font-semibold">Getting there</p>
        <ul className="mt-1 space-y-1 text-sm text-muted">
          {option.travel
            .filter((t) => !lock.leftOutIds.includes(t.memberId))
            .map((t) => (
              <li key={t.memberId}>
                {view.members.find((m) => m.id === t.memberId)?.name}: {t.route} (~{Math.round(t.durationHours)}h)
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
