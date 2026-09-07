-- PIC-32: single "like" reaction per GM per post (Epic 4). Unique on (post_id, roster_id)
-- so a repeat insert attempt is rejected at the DB level — the app-layer toggle (see
-- lib/feed/reactions-actions.ts) checks for an existing row first and deletes instead of
-- inserting, but the constraint is the real backstop against a race producing duplicates.
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  roster_id uuid not null references public.roster(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, roster_id)
);

create index reactions_post_id_idx on public.reactions(post_id);

alter table public.reactions enable row level security;

-- Mirrors posts_insert_commissioner's exact shape (00000000000005_posts.sql) — read: all
-- authenticated; insert: any authenticated GM as themselves; delete: own reaction OR
-- commissioner-role on any (NF6's moderation parity with comments/PIC-33).
create policy reactions_select_authenticated on public.reactions
  for select to authenticated using (true);
create policy reactions_insert_own on public.reactions
  for insert to authenticated with check (roster_id = public.current_roster_id());
create policy reactions_delete_own_or_commissioner on public.reactions
  for delete to authenticated using (
    roster_id = public.current_roster_id() or public.is_commissioner()
  );
