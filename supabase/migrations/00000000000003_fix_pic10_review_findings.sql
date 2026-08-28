-- Fixes from PIC-10's E4 code review:
-- 1. Missing INSERT policy on notifications (CT2b's notify step was silently failing).
-- 2. applySpreadEdit's four writes need to be atomic — wraps the void+notify path in a
--    single transactional function instead of four independent client-side awaits.
-- 3. Duplicate-matchup guard on games (should-fix, cheap to include here).

create policy notifications_insert_commissioner on public.notifications
  for insert to authenticated with check (public.is_commissioner());

create unique index games_week_matchup_unique
  on public.games (week_id, away_team, home_team);

-- Atomic CT2/CT2b spread edit: updates the spread, voids any submitted picks for the
-- game, and notifies affected GMs, all in one transaction. If any step fails (including
-- the "blocked once scored" trigger), the whole edit rolls back — no partial state where
-- the spread changed but picks weren't voided, or picks were voided but no notification
-- was sent.
create or replace function public.apply_spread_edit(p_game_id uuid, p_new_spread numeric)
returns table (affected_count int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_affected int;
begin
  update public.games
  set spread = p_new_spread, updated_at = now()
  where id = p_game_id;

  with voided as (
    update public.picks
    set pick_status = 'voided', updated_at = now()
    where game_id = p_game_id and pick_status = 'submitted'
    returning roster_id
  )
  insert into public.notifications (roster_id, message)
  select roster_id,
    'Your pick for this game was cleared because the spread changed — resubmit before kickoff.'
  from voided;

  get diagnostics v_affected = row_count;
  return query select v_affected;
end;
$$;

-- security invoker means this still runs under the caller's RLS — the underlying
-- games/picks/notifications policies (commissioner-only writes) are the actual
-- authorization boundary, same pattern as every other write path in this schema.
grant execute on function public.apply_spread_edit(uuid, numeric) to authenticated;
