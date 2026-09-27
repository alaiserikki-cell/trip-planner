-- Group Trip Decider schema. Run this once in the Supabase SQL editor.
-- The app talks to these tables only from the server with the service-role key.
-- RLS is enabled with no policies, so the public anon key can read nothing.

create table if not exists trips (
  id uuid primary key,
  name text not null,
  window_start date not null,
  window_end date not null,
  trip_length text not null check (trip_length in ('2-3', '4-5', '6+')),
  deadline timestamptz not null,
  status text not null default 'collecting'
    check (status in ('collecting', 'generating', 'voting', 'deciding', 'locked')),
  round int not null default 1,
  organiser_key text not null,
  generation_started_at timestamptz,
  generation_error text,
  voting_closed_round int not null default 0,
  preview_started_at timestamptz,                  -- early look is being planned
  preview_key text,                                -- which answers the early look used
  created_at timestamptz not null default now()
);
-- For databases created before the early look existed:
alter table trips add column if not exists preview_started_at timestamptz;
alter table trips add column if not exists preview_key text;

create table if not exists trip_members (
  id uuid primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  position int not null,
  is_organiser boolean not null default false,
  device_token text,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trip_members_trip_idx on trip_members(trip_id);

create table if not exists trip_preferences (
  member_id uuid primary key references trip_members(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  starting_city text not null,
  dates jsonb not null default '{}'::jsonb,          -- { "2026-11-14": "available" | "maybe" }
  budget int not null check (budget between 5000 and 100000),
  budget_firmness text not null check (budget_firmness in ('hard', 'stretch')),
  trip_types text[] not null default '{}',           -- in order of preference, max 3
  travel_modes text[] not null default '{}',
  deal_breakers text[] not null default '{}',
  deal_breaker_other text not null default '',
  deal_breakers_anonymous boolean not null default false, -- opt-in; named by default
  fit_private boolean not null default false,             -- opt-in; fit row visible by default
  great_trip text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists trip_preferences_trip_idx on trip_preferences(trip_id);
-- For databases created before this column existed:
alter table trip_preferences add column if not exists deal_breakers_anonymous boolean not null default false;
alter table trip_preferences add column if not exists fit_private boolean not null default false;

-- Step 1 output (computed in code, not AI), one row per round.
create table if not exists trip_constraints (
  trip_id uuid not null references trips(id) on delete cascade,
  round int not null,
  date_windows jsonb not null,
  budget_ceiling int,                                -- lowest hard-limit budget, null if nobody set one
  soft_budget int not null,
  exclusions jsonb not null,                         -- anonymised deal-breakers
  participant_ids jsonb not null,
  missing_ids jsonb not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, round)
);

create table if not exists trip_options (
  id uuid primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  round int not null,
  rank int not null,
  destination text not null,
  details jsonb not null,                            -- dates, day plan, cost estimates, routes, why, photo
  fits jsonb not null,                               -- per-person fit markers + summary
  min_fit numeric not null,
  avg_fit numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists trip_options_trip_idx on trip_options(trip_id, round);

create table if not exists trip_votes (
  id bigint generated always as identity primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  option_id uuid not null references trip_options(id) on delete cascade,
  member_id uuid not null references trip_members(id) on delete cascade,
  round int not null,
  choice text not null check (choice in ('in', 'maybe', 'out')),
  reason text not null default '',
  updated_at timestamptz not null default now(),
  unique (option_id, member_id)
);
create index if not exists trip_votes_trip_idx on trip_votes(trip_id);

-- Vote changes made after voting closed. Visible to the whole group.
create table if not exists trip_vote_changes (
  id uuid primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  option_id uuid not null references trip_options(id) on delete cascade,
  member_id uuid not null references trip_members(id) on delete cascade,
  from_choice text not null,
  to_choice text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists trip_locks (
  trip_id uuid primary key references trips(id) on delete cascade,
  option_id uuid not null references trip_options(id),
  in_member_ids jsonb not null,
  left_out_ids jsonb not null,
  checklist jsonb not null,
  locked_at timestamptz not null default now()
);

alter table trips enable row level security;
alter table trip_members enable row level security;
alter table trip_preferences enable row level security;
alter table trip_constraints enable row level security;
alter table trip_options enable row level security;
alter table trip_votes enable row level security;
alter table trip_vote_changes enable row level security;
alter table trip_locks enable row level security;
