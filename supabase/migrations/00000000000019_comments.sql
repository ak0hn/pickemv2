-- PIC-33: post comments (Epic 4). Mirrors reactions' exact RLS shape
-- (00000000000018_reactions.sql), which itself mirrors posts_insert_commissioner
-- (00000000000005_posts.sql) — read: all authenticated; insert: any authenticated GM as
-- themselves; delete: own comment OR commissioner-role on any (NF5/NF6).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_roster_id uuid not null references public.roster(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_post_id_idx on public.comments(post_id, created_at);

alter table public.comments enable row level security;

create policy comments_select_authenticated on public.comments
  for select to authenticated using (true);
create policy comments_insert_own on public.comments
  for insert to authenticated with check (author_roster_id = public.current_roster_id());
create policy comments_delete_own_or_commissioner on public.comments
  for delete to authenticated using (
    author_roster_id = public.current_roster_id() or public.is_commissioner()
  );
