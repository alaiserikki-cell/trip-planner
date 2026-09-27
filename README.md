# Plan it: group trip decider

For groups of friends in different cities, of any size, who keep failing to plan a trip over WhatsApp. Everyone answers privately, the app finds three trips that work for the group, everyone votes, and the organiser locks one.

## Run it

```bash
npm install
cp .env.example .env.local   # add keys (optional for a first try)
npm run dev
```

If Gemini is unavailable (for example the free-tier quota runs out), the planner falls back to the database: every destination Gemini has planned before is saved with its coordinates, trip types, day plan and cost bands, and is scored against the group alongside a small built-in catalogue. The fallback gets better with every trip.

With no keys, the app still runs end to end. It uses an offline planner, gradient covers and an in-memory store that resets when the server restarts.

### Connecting the services

| Service | Env vars | What it does |
|---|---|---|
| Gemini | `GEMINI_API_KEY`, optional `GEMINI_MODEL` | Generates the 3 options, writes each person's fit sentence, and generates round 2 from the votes |
| Unsplash | `UNSPLASH_ACCESS_KEY` | Cover photo per destination, credited on the card |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Stores everything, including a library of every destination Gemini has planned. Run `supabase/schema.sql` first |

Keys are read from the environment only, and only on the server. RLS is on for every table with no policies, so the public anon key can't read anything.

## How it works

1. **Create.** The organiser sets the name, the travel window, trip length and deadline (48h by default), and can list friends' names or skip that. They get one link, a QR code and a WhatsApp share button.
   - **Open invite:** friends who aren't listed add their own name from the link. There is no limit on group size. The organiser can remove a name until that person has answered. From the very first answer, everyone who has answered sees an "Early look": 3 options planned from the answers so far, replanned each time someone answers or edits. Voting starts when the organiser taps Start voting (once 2+ have answered) or at the deadline, never automatically, because more friends may still be joining. If the early look already covers everyone, it becomes the final options instantly. Friends can join until the trip is locked: someone who joins while voting is open can add their answers and is added as a voter. Anyone can edit their answers until voting closes; the options stay as they are and everyone's fit, the group fit and the ranking are recalculated.
2. **Answer privately.** Each friend picks their name. That name is then tied to their device, and the organiser can reset it if they switch phones. They fill in city, dates (Available / Maybe / No), budget and how firm it is, trip types (ranked, max 3), travel modes, deal-breakers and a free-text answer. They can edit until options are generated.
3. **Track.** The organiser sees ticks, never answers, plus a Nudge button that copies a reminder. If the deadline passes with people missing, they can extend by 24h or go ahead. Anyone missing shows as "No preferences submitted" on every option.
4. **Generate.**
   - *Step 1, in code* (`lib/constraints.ts`): finds the best date windows (most Available, then Maybe), sets the budget ceiling from the lowest hard limit, and combines the deal-breakers.
   - *Step 2, Gemini* (`lib/planner.ts`): writes 3 options that respect those constraints, using structured output.
   - *Code again:* scores fit per person (dates / budget / trip type / travel as green, amber or red), then ranks options by the worst individual fit first and the average second.
5. **Vote.** Each person picks I'm in / I'd go if needed / I'm out, and "out" needs a reason. Votes stay hidden until everyone has voted, then everyone sees each vote. After that, changing a vote needs a reason and is shown to the group.
6. **Round 2 / stalemate.** If every option has an "out", Gemini reads the votes and reasons and writes 3 new options, never repeating a round 1 destination. If round 2 also fails, the app shows the best-supported option and exactly what blocks it, and for whom.
7. **Lock.** Only the organiser can lock. Locking an option someone voted out on needs a confirmation that names who's left out. The result is a shareable trip card (image) plus a dated checklist of next steps. Nothing gets booked.

## My trips

`/trips` lists every trip started or joined on that phone or browser: in progress first, then previous (locked) trips with their destination and dates. The home page shows the latest three of each under "Your trips". There are no accounts, so the browser sends the device tokens it already holds and the server only returns trips those tokens prove it belongs to.

## Privacy rules enforced in the API (`lib/engine.ts → buildView`)

- Nobody else's preferences are ever sent to a browser.
- Budget shows only as Within / Stretch / Over. AI-written sentences are rejected and replaced with a template if they contain an amount.
- Deal-breakers are shown with the person's name by default ("Karan ruled out treks"). Anyone can opt in to "Keep my deal-breakers anonymous", which shows theirs as "Someone in the group ruled out…". Anonymity is always opt-in, never the default.
- Votes are hidden until voting closes.

## Layout

```
app/api/trips/…      route handlers (create, mine, view, join, preferences, deadline, generate, vote, close-voting, lock, reset-claim, remove-member)
app/t/[id]/page.tsx  the single trip page; what it shows depends on status and role
app/trips/page.tsx   My trips: past and current trips on this device
lib/constraints.ts   deterministic step 1, fit scoring, ranking, blockers, checklist
lib/planner.ts       Gemini planner + offline fallback
lib/engine.ts        generation runs, voting rounds, per-viewer views
lib/store.ts         Supabase store + in-memory fallback
supabase/schema.sql  database schema
```
