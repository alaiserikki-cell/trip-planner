"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, RefreshCw, Sparkles } from "lucide-react";
import LockedTrip from "@/components/LockedTrip";
import NamePicker from "@/components/NamePicker";
import OptionsBoard from "@/components/OptionsBoard";
import PreferenceForm, { type PreferenceInput } from "@/components/PreferenceForm";
import SharePanel from "@/components/SharePanel";
import Tracker from "@/components/Tracker";
import { Wordmark } from "@/components/Flourish";
import { Avatar, Notice } from "@/components/ui";
import { useTrip } from "@/hooks/useTrip";
import { api, forgetMember, getIdentity, saveMember, saveOrganiserKey, type Identity } from "@/lib/client";
import { prettyDeadline, prettySpan, timeLeft } from "@/lib/dates";
import { TRIP_LENGTH_LABEL, type TripView } from "@/lib/types";

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [origin, setOrigin] = useState("");
  const { view, error, notFound, refresh } = useTrip(id, identity);

  useEffect(() => {
    // Organiser recovery link: /t/<id>?k=<key>. Save it and tidy the URL.
    const qs = new URLSearchParams(window.location.search);
    const k = qs.get("k");
    if (k) saveOrganiserKey(id, k);
    if (qs.has("k") || qs.has("new")) window.history.replaceState(null, "", `/t/${id}`);
    // Hydrate client-only values once mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsNew(qs.has("new"));
    setOrigin(window.location.origin);
    setIdentity(getIdentity(id));
  }, [id]);

  const url = `${origin}/t/${id}`;

  if (notFound) {
    return (
      <Shell>
        <Notice tone="bad">This trip link doesn&apos;t exist. Check you copied the whole link.</Notice>
        <Link href="/" className="btn btn-primary mt-4 w-full py-3">
          Plan a new trip
        </Link>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        {error ? <Notice tone="bad">{error}</Notice> : <div className="h-40 animate-pulse rounded-3xl bg-sunk" />}
      </Shell>
    );
  }

  const join = async (name: string) => {
    const res = await api<{ memberId: string; token: string }>(`/api/trips/${id}/join`, identity, { name });
    saveMember(id, res.memberId, res.token);
    setIdentity(getIdentity(id));
  };

  if (!view.me) {
    return (
      <Shell>
        {view.trip.status === "locked" ? (
          <LockedTrip view={view} />
        ) : (
          <NamePicker tripName={view.trip.name} organiserName={view.members.find((m) => m.isOrganiser)?.name} onJoin={join} />
        )}
      </Shell>
    );
  }

  return (
    <Shell
      header={
        <TripHeader
          view={view}
          onSwitch={
            view.isOrganiser
              ? undefined
              : () => {
                  forgetMember(id);
                  setIdentity(getIdentity(id));
                }
          }
        />
      }
    >
      <Body view={view} identity={identity!} url={url} isNew={isNew} refresh={refresh} />
    </Shell>
  );
}

function Body({ view, identity, url, isNew, refresh }: { view: TripView; identity: Identity; url: string; isNew: boolean; refresh: () => Promise<void> }) {
  const { trip, me, isOrganiser, members } = view;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const meView = members.find((m) => m.id === me!.memberId)!;
  const waitingOn = members.filter((m) => !m.submitted);

  const submit = async (p: PreferenceInput) => {
    await api(`/api/trips/${trip.id}/preferences`, identity, p);
    setEditing(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    await refresh();
  };

  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/trips/${trip.id}/${path}`, identity, body);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (trip.status === "locked" && view.lock) return <LockedTrip view={view} />;

  if (trip.status === "generating") {
    return (
      <div className="card rise p-8 text-center">
        {view.generationStale ? (
          <>
            <p className="font-display text-xl font-bold">That didn&apos;t work</p>
            <p className="mt-2 text-sm text-muted">{trip.generationError ?? "Generating options is taking too long."}</p>
            {isOrganiser ? (
              <button disabled={busy} onClick={() => act("generate", {})} className="btn btn-primary mt-5 px-6 py-3">
                <RefreshCw size={16} /> Try again
              </button>
            ) : (
              <p className="mt-4 text-sm text-muted">The organiser can retry this.</p>
            )}
            {actionError && <div className="mt-3"><Notice tone="bad">{actionError}</Notice></div>}
          </>
        ) : (
          <>
            <Sparkles className="drift mx-auto text-brand" size={36} />
            <p className="font-display mt-4 text-2xl font-bold">Planning your trips…</p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
              {trip.round > 1
                ? "Reading the votes and the reasons, and finding three new options."
                : "Finding the dates that work for most of you, the budget everyone can do, and three trips that fit. About a minute."}
            </p>
          </>
        )}
      </div>
    );
  }

  if (trip.status === "voting" || trip.status === "deciding") {
    return (
      <div className="space-y-4">
        {!meView.submitted && <Notice>You didn&apos;t send preferences this time, so you show as “No preferences submitted”. You can still vote.</Notice>}
        <OptionsBoard view={view} identity={identity} url={url} refresh={refresh} />
      </div>
    );
  }

  // Collecting preferences
  const showForm = !meView.submitted || editing;
  return (
    <div className="space-y-4">
      {isOrganiser && (
        <SharePanel url={url} tripName={trip.name} deadline={trip.deadline} defaultOpen={isNew || members.filter((m) => m.submitted).length <= 1} />
      )}

      {view.deadlinePassed &&
        (isOrganiser ? (
          <div className="card space-y-3 border-warn p-5">
            <p className="font-display text-lg font-bold">The deadline has passed</p>
            <p className="text-sm text-muted">
              {waitingOn.length ? (
                <>
                  Still waiting on {waitingOn.map((m) => m.name).join(", ")}. Give them another day, or go ahead with the{" "}
                  {members.length - waitingOn.length} who answered. Anyone missing will show as “No preferences submitted” on every option.
                </>
              ) : (
                <>
                  Only {members.length} {members.length === 1 ? "person has" : "people have"} joined so far. Give others another day to add
                  themselves, or go ahead with who&apos;s here.
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => act("deadline", { action: "extend" })} className="btn btn-ghost py-3 text-sm">
                Extend 24 hours
              </button>
              <button disabled={busy} onClick={() => act("deadline", { action: "proceed" })} className="btn btn-primary py-3 text-sm">
                Go ahead
              </button>
            </div>
            {actionError && <Notice tone="bad">{actionError}</Notice>}
          </div>
        ) : (
          <Notice tone="warn">The deadline has passed. The organiser is deciding whether to wait a bit longer or go ahead.</Notice>
        ))}

      {showForm ? (
        <>
          {!meView.submitted && (
            <div className="pt-2">
              <h2 className="font-display text-2xl font-bold">Hi {me!.name} 👋</h2>
              <p className="text-sm text-muted">Seven quick questions. About three minutes.</p>
            </div>
          )}
          <PreferenceForm trip={trip} initial={me!.preferences} onSubmit={submit} onCancel={editing ? () => setEditing(false) : undefined} />
        </>
      ) : (
        <div className="card rise p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="shrink-0 text-ok" size={28} />
            <div className="flex-1">
              <p className="font-display text-xl font-bold">You&apos;re in</p>
              <p className="mt-1 text-sm text-muted">
                {members.length < 3
                  ? `${members.length} ${members.length === 1 ? "person" : "people"} so far. Options appear once at least 3 people have joined and answered, or at the deadline. Friends can add themselves from the link.`
                  : waitingOn.length
                    ? `Waiting on ${waitingOn.length} more. Options appear as soon as everyone has answered, or at the deadline.`
                    : "Everyone has answered. Options are on their way."}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm">
                <Clock size={14} className="text-muted" /> {timeLeft(trip.deadline, view.now)}
                <span className="text-muted">· {prettyDeadline(trip.deadline)}</span>
              </p>
              <button onClick={() => setEditing(true)} className="mt-4 text-sm font-semibold text-brand">
                Edit my answers
              </button>
            </div>
          </div>
        </div>
      )}

      {isOrganiser && (
        <Tracker
          mode="submit"
          members={members}
          tripName={trip.name}
          url={url}
          deadline={trip.deadline}
          onReset={(memberId) => act("reset-claim", { memberId })}
          onRemove={(memberId) => act("remove-member", { memberId })}
        />
      )}
    </div>
  );
}

function TripHeader({ view, onSwitch }: { view: TripView; onSwitch?: () => void }) {
  const { trip, members } = view;
  return (
    <header className="mb-5">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Plan it home">
          <Wordmark className="text-xl" />
        </Link>
        {onSwitch && (
          <button onClick={onSwitch} className="text-xs text-muted">
            Not {view.me?.name}?
          </button>
        )}
      </div>
      <h1 className="font-display mt-4 text-4xl font-bold leading-tight">{trip.name}</h1>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {TRIP_LENGTH_LABEL[trip.tripLength]} · {prettySpan(trip.windowStart, trip.windowEnd)}
        </p>
        <div className="flex -space-x-2">
          {members.map((m, i) => (
            <span key={m.id} className="rounded-full ring-2 ring-bg">
              <Avatar name={m.name} index={i} size={26} />
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function Shell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
      {header}
      {children}
    </main>
  );
}
