-- PIC-11: shared post-composer (CT17). Posts table backs all four trigger types —
-- Open Week, Close Week, Open Tiebreaker, and free-form. `block_data` holds the
-- trigger's structured content (matchup rows, results/standings snapshot, tiebreaker
-- matchup) as the data contract Epic 4 (Newsfeed rendering) reads — shape is documented
-- in the Design System's CT17 section, not enforced by a schema here since each trigger
-- type's shape differs and Epic 4 hasn't been built yet to consume it.
create type post_trigger as enum ('open_week', 'close_week', 'open_tiebreaker', 'freeform');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_roster_id uuid not null references public.roster(id) on delete cascade,
  week_id uuid references public.weeks(id) on delete set null,
  trigger post_trigger not null,
  message text not null default '',
  image_url text,
  block_data jsonb,
  created_at timestamptz not null default now()
);

create index posts_week_id_idx on public.posts(week_id);
create index posts_created_at_idx on public.posts(created_at desc);

-- Free-form posts carry no block; every other trigger type must have one — a triggered
-- composer post with a null block would mean CT17's "auto-attach the block" rule was
-- bypassed somehow.
alter table public.posts add constraint posts_block_data_required
  check (
    (trigger = 'freeform' and block_data is null)
    or (trigger != 'freeform' and block_data is not null)
  );

alter table public.posts enable row level security;

-- Everyone authenticated can read posts (this is what Epic 4's feed will eventually
-- render). Only commissioners can post in Epic 1's scope — GM-authored free-form posts,
-- if ever added, are a future epic's decision, not assumed here.
create policy posts_select_authenticated on public.posts
  for select to authenticated using (true);
create policy posts_insert_commissioner on public.posts
  for insert to authenticated with check (
    public.is_commissioner() and author_roster_id = public.current_roster_id()
  );
