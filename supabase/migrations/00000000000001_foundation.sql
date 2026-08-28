-- Foundation schema for PIC-10 (Slate Builder) and the tables it depends on.
-- Pick-lock model and state machine per the Week Lifecycle Spec (locked Aug 26, 2026):
-- lock state is always derived from games.kickoff_at — no locked_at column, no
-- lock-status enum, no background job. "locked" = pick_status = 'submitted' AND
-- kickoff_at <= now().

create extension if not exists "pgcrypto";

-- Roster: allowlisted GMs + commissioners. Backup-commissioner elevation (CT12) is a
-- per-query column read on this table, not a JWT claim, so it takes effect immediately.
create type user_role as enum ('gm', 'commissioner');

create table public.roster (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  display_name text,
  role user_role not null default 'gm',
  created_at timestamptz not null default now()
);

-- Weeks: seeded upfront from the known NFL schedule at league setup, not created
-- reactively by week.close(). 'draft' = not yet published (CT4); 'closed' = week.close()
-- has run (CT18).
create type week_state as enum ('draft', 'published', 'closed');

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  week_number int not null unique,
  state week_state not null default 'draft',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Games: one row per matchup in a week. `spread` is the home team's line (e.g. -6.5 =
-- home favored by 6.5); null until entered via CT1's stub or CT3's manual entry.
create type game_status as enum ('scheduled', 'voided', 'final');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  away_team text not null,
  home_team text not null,
  spread numeric(4,1),
  kickoff_at timestamptz not null,
  status game_status not null default 'scheduled',
  home_score int,
  away_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_week_id_idx on public.games(week_id);

-- Spread edits are blocked outright once a game has been scored (CT2) — enforced here,
-- not just in the UI, since this is a hard rule with no exception.
create or replace function public.enforce_no_spread_edit_after_final()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'final' and new.spread is distinct from old.spread then
    raise exception 'Spread cannot be edited once a game has been scored (game %)', old.id;
  end if;
  return new;
end;
$$;

create trigger games_no_spread_edit_after_final
  before update on public.games
  for each row
  execute function public.enforce_no_spread_edit_after_final();

-- Picks: one row per GM per game they've submitted a pick for. `unset` (no row),
-- `submitted`, `voided`, `scored` are the four states — "locked" is derived, not stored.
-- Full write scope for GM submission/self-edit (Epic 2) and CT6 correction (PIC-15) is
-- built out in their own tickets; this migration only carries what CT2b (void-on-edit)
-- needs to read and write.
create type pick_status as enum ('submitted', 'voided', 'scored');

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  roster_id uuid not null references public.roster(id) on delete cascade,
  pick_value text not null,
  pick_status pick_status not null default 'submitted',
  is_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, roster_id)
);

create index picks_roster_id_idx on public.picks(roster_id);
create index picks_game_id_idx on public.picks(game_id);

-- In-app notifications (CT2b, CT7's shared pattern) — a persisted record surfaced as a
-- banner/toast next time the affected GM loads the app. Not push/email (Epic 7).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.roster(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_roster_id_unread_idx on public.notifications(roster_id) where read_at is null;

-- Role lookups: per-query DB-column reads (CT12 requirement — not a JWT custom claim,
-- since Supabase JWTs can take up to an hour to refresh).
create or replace function public.current_roster_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.roster where auth_user_id = auth.uid();
$$;

create or replace function public.is_commissioner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.roster
    where auth_user_id = auth.uid() and role = 'commissioner'
  );
$$;

alter table public.roster enable row level security;
alter table public.weeks enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;
alter table public.notifications enable row level security;

-- Roster: everyone authenticated can read display names; only commissioners manage roles
-- (CT12 elevation, CT13 single-add both go through commissioner-scoped server actions).
create policy roster_select_authenticated on public.roster
  for select to authenticated using (true);
create policy roster_write_commissioner on public.roster
  for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

-- Weeks/games: commissioners have full access. GMs only see a week (and its games) once
-- it's left draft state — satisfies CT4's "spread hidden before publish" AC by hiding the
-- whole row pre-publish. NOTE: if a future epic needs matchups-visible-but-spread-hidden
-- pre-publish (foundational PRD's WP8), this row-level policy will need to become
-- column-level — deliberately not built now, out of scope for PIC-10.
create policy weeks_select_published on public.weeks
  for select to authenticated using (state != 'draft' or public.is_commissioner());
create policy weeks_write_commissioner on public.weeks
  for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

create policy games_select_published on public.games
  for select to authenticated using (
    public.is_commissioner()
    or exists (select 1 from public.weeks w where w.id = games.week_id and w.state != 'draft')
  );
create policy games_write_commissioner on public.games
  for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

-- Picks: commissioners read all (CT5's full-value tracker is a deliberate exception to
-- GM-to-GM privacy, not a leak); GMs read only their own. Write policies for GM
-- self-submission (Epic 2) and CT6 correction (PIC-15) are scoped in their own tickets.
create policy picks_select_own_or_commissioner on public.picks
  for select to authenticated using (
    roster_id = public.current_roster_id() or public.is_commissioner()
  );
create policy picks_write_commissioner on public.picks
  for all to authenticated using (public.is_commissioner()) with check (public.is_commissioner());

-- Notifications: each GM reads/updates (marks read) only their own.
create policy notifications_select_own on public.notifications
  for select to authenticated using (roster_id = public.current_roster_id());
create policy notifications_update_own on public.notifications
  for update to authenticated using (roster_id = public.current_roster_id())
  with check (roster_id = public.current_roster_id());
