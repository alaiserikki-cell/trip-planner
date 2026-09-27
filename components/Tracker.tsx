"use client";

import { useState } from "react";
import { Check, Clock } from "lucide-react";
import { copyText } from "@/lib/client";
import { prettyDeadline } from "@/lib/dates";
import { Avatar } from "./ui";
import type { MemberView } from "@/lib/types";

// Organiser-only list of who has done their part. Shows ticks, never answers.
export default function Tracker({
  mode,
  members,
  participantIds,
  tripName,
  url,
  deadline,
  onReset,
  onRemove,
}: {
  mode: "submit" | "vote";
  members: MemberView[];
  participantIds?: string[];
  tripName: string;
  url: string;
  deadline: string;
  onReset: (memberId: string) => Promise<void>;
  onRemove?: (memberId: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const list = mode === "vote" && participantIds ? members.filter((m) => participantIds.includes(m.id)) : members;
  const isDone = (m: MemberView) => (mode === "submit" ? m.submitted : m.votedAll);
  const done = list.filter(isDone).length;

  const nudge = async (m: MemberView) => {
    const text =
      mode === "submit"
        ? `Hey ${m.name}! Still need your answers for "${tripName}" 🙏 Takes 3 minutes, and only you see them: ${url} (by ${prettyDeadline(deadline)})`
        : `Hey ${m.name}! The trip options for "${tripName}" are up. Just need your votes so we can lock it: ${url}`;
    if (await copyText(text)) {
      setCopied(m.id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display text-lg font-bold">{mode === "submit" ? "Who's submitted" : "Who's voted"}</p>
        <span className="text-sm font-semibold text-muted">
          {done}/{list.length}
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-sunk">
        <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${(done / Math.max(1, list.length)) * 100}%` }} />
      </div>
      <ul className="divide-y divide-line">
        {list.map((m) => {
          const i = members.findIndex((x) => x.id === m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.name} index={i} size={30} />
              <span className="flex-1 truncate font-medium">
                {m.name}
                {m.isOrganiser && <span className="ml-1.5 text-xs font-normal text-muted">organiser</span>}
              </span>
              {isDone(m) ? (
                <span className="flex items-center gap-1 text-sm font-semibold text-ok">
                  <Check size={16} strokeWidth={3} /> Done
                </span>
              ) : (
                <div className="flex items-center gap-3">
                  {onRemove && !m.isOrganiser && mode === "submit" && (
                    <button
                      onClick={() => {
                        if (confirm(`Take ${m.name} off the list?`)) onRemove(m.id);
                      }}
                      className="text-xs text-muted underline-offset-2 hover:text-bad hover:underline"
                    >
                      Remove
                    </button>
                  )}
                  {m.claimed && !m.isOrganiser && mode === "submit" && (
                    <button
                      onClick={() => {
                        if (confirm(`Reset ${m.name}'s link? Use this if they need to open it on a different phone.`)) onReset(m.id);
                      }}
                      className="text-xs text-muted underline-offset-2 hover:underline"
                    >
                      Reset
                    </button>
                  )}
                  {m.isOrganiser ? (
                    <span className="text-xs text-muted">Not yet</span>
                  ) : (
                    <button onClick={() => nudge(m)} className="btn btn-ghost px-3 py-1.5 text-xs">
                      {copied === m.id ? (
                        <>
                          <Check size={14} /> Copied
                        </>
                      ) : (
                        <>
                          <Clock size={14} /> Nudge
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {copied && <p className="mt-2 text-xs text-muted">Reminder copied. Paste it in WhatsApp.</p>}
    </div>
  );
}
