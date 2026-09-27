import { ArrowRight, ArrowDown } from "lucide-react";
import CreateTripForm from "@/components/CreateTripForm";
import RecentTrips from "@/components/RecentTrips";
import { CurvedText, Underline, Wordmark } from "@/components/Flourish";
import { coverPhoto } from "@/lib/unsplash";

const STEPS = [
  { n: "01", title: "Everyone answers privately", body: "Dates, budget, vibe. Three minutes, and nobody sees anyone else's answers." },
  { n: "02", title: "Three trips that fit", body: "Real options built around the whole group, showing who each one works for." },
  { n: "03", title: "Vote, then lock it", body: "A clear yes from each person, and a trip card to drop in the group chat." },
];

export default async function Home() {
  // Cached for a day so the landing page isn't an API call per visit.
  const hero = await coverPhoto("himalaya mountain valley road trip", { revalidate: 86_400 });

  return (
    <main className="flex-1">
      <section className="relative isolate flex min-h-[92svh] flex-col overflow-hidden text-white">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_30%_20%,#f2870d,transparent_55%),radial-gradient(circle_at_75%_80%,#0f766e,transparent_60%),#251d18]" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/30 to-black/60" />

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
          <Wordmark light className="text-2xl" />
          <nav className="flex items-center gap-2">
            <a href="/trips" className="rounded-full px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10">
              My trips
            </a>
            <a href="#start" className="rounded-full border border-white/40 px-4 py-2 text-sm font-medium backdrop-blur-sm transition hover:bg-white/10">
              Start a trip
            </a>
          </nav>
        </header>

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-5 pb-16 text-center">
          <CurvedText className="rise w-64 text-white/90 sm:w-80">Trips that actually happen</CurvedText>
          <h1 className="font-display rise -mt-3 text-6xl font-bold leading-[0.95] sm:text-8xl" style={{ animationDelay: "60ms" }}>
            Plan <em>it.</em>
          </h1>
          <p className="rise mt-6 max-w-xl text-lg font-medium leading-relaxed text-white/95 sm:text-xl" style={{ animationDelay: "120ms" }}>
            Stop debating dates in the group chat. Everyone answers privately, and you <Underline>lock one trip</Underline> that works for all of you.
          </p>
          <a href="#start" className="btn btn-primary rise mt-10 px-7 py-3.5 text-base" style={{ animationDelay: "180ms" }}>
            Start planning <ArrowRight size={18} />
          </a>
        </div>

        <a href="#how" className="mx-auto mb-6 flex flex-col items-center text-xs font-medium uppercase tracking-[0.2em] text-white/75">
          How it works
          <ArrowDown size={16} className="drift mt-1 rotate-0" />
        </a>
        {hero && (
          <a
            href={hero.creditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-4 text-[10px] text-white/60 hover:text-white"
          >
            Photo: {hero.credit} / Unsplash
          </a>
        )}
      </section>

      <RecentTrips />

      <section id="how" className="mx-auto w-full max-w-6xl px-5 py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-brand">For friends in different cities, however many of you there are</p>
        <h2 className="font-display mx-auto mt-3 max-w-2xl text-center text-4xl font-bold leading-tight sm:text-5xl">
          From <em className="text-gradient pr-1">“we should do a trip”</em> to booked in a week.
        </h2>
        <ol className="mt-14 grid gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-7">
              <span className="font-display text-4xl font-bold italic text-gradient">{s.n}</span>
              <p className="font-display mt-4 text-xl font-bold">{s.title}</p>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="start" className="scroll-mt-4 bg-sunk/60 px-4 py-20">
        <div className="mx-auto max-w-xl">
          <h2 className="font-display text-center text-4xl font-bold sm:text-5xl">
            Start your <em className="text-gradient pr-1">trip</em>
          </h2>
          <p className="mt-3 text-center text-muted">Takes a minute. You&apos;ll get one link to drop in the group.</p>
          <div className="mt-10">
            <CreateTripForm />
          </div>
        </div>
      </section>

      <footer className="px-5 py-10 text-center text-sm text-muted">
        <Wordmark className="text-lg" />
        <p className="mt-1">All costs are estimates. We never book anything for you.</p>
      </footer>
    </main>
  );
}
