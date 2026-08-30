-- Fixes from PIC-15's E4 review. Recreates apply_pick_correction (migration 15, already
-- applied remotely — editing an already-applied migration doesn't get picked up by
-- `supabase db push`, same reasoning as migration 14's split from migration 13).
--
-- 1. Correcting a VOIDED pick left pick_status = 'voided' untouched while silently
--    changing pick_value/is_correct — since week_close() only ever scores rows where
--    pick_status = 'submitted', that correction was permanently excluded from scoring
--    with no error and no signal to the commish. 'Voided' currently only ever means "the
--    spread changed, this pick needs resubmission" (CT2b) — a commish correction on a
--    voided pick IS that resubmission, done on the GM's behalf, so it un-voids the pick
--    the same way a fresh GM resubmission would. The "never mutates pick_status"
--    technical note was written for the submitted/scored case; voided needed its own
--    explicit rule, which this is. Existing submitted/scored rows are still left alone.
-- 2. is_correct was unconditionally overwritten with NULL whenever the game isn't
--    currently final — including the edge case where week_close() already scored the
--    pick and the game's status was later reverted (no trigger prevents that; only
--    spread edits are blocked post-final). That produced pick_status = 'scored' with
--    is_correct = NULL, which nothing downstream expects. Now only overwrites is_correct
--    when the correction can actually recompute a real value.
create or replace function public.apply_pick_correction(
  p_game_id uuid,
  p_roster_id uuid,
  p_pick_value text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_game record;
  v_margin numeric;
  v_home_covers boolean;
  v_is_correct boolean;
  v_pick_status pick_status;
begin
  if not exists (
    select 1 from public.roster where auth_user_id = auth.uid() and role = 'commissioner'
  ) then
    raise exception 'Only the commissioner can correct a pick';
  end if;

  select id, home_team, away_team, home_score, away_score, spread, status
  into v_game
  from public.games
  where id = p_game_id;

  if v_game.id is null then
    raise exception 'Game not found';
  end if;

  if p_pick_value not in (v_game.away_team, v_game.home_team) then
    raise exception 'Pick value must be one of the two teams playing in this game';
  end if;

  v_is_correct := null;
  v_pick_status := 'submitted';
  if v_game.status = 'final' and v_game.home_score is not null and v_game.away_score is not null then
    v_margin := (v_game.home_score - v_game.away_score) + coalesce(v_game.spread, 0);
    v_home_covers := v_margin > 0;
    v_is_correct := case
      when p_pick_value = v_game.home_team then v_home_covers
      when p_pick_value = v_game.away_team then not v_home_covers and v_margin <> 0
      else false
    end;
    v_pick_status := 'scored';
  end if;

  insert into public.picks (game_id, roster_id, pick_value, pick_status, is_correct)
  values (p_game_id, p_roster_id, p_pick_value, v_pick_status, v_is_correct)
  on conflict (game_id, roster_id) do update
  set pick_value = excluded.pick_value,
      -- Only un-void — a submitted/scored row keeps its own status untouched, unchanged
      -- from migration 15's behavior.
      pick_status = case
        when picks.pick_status = 'voided' then excluded.pick_status
        else picks.pick_status
      end,
      -- Only overwrite with a freshly computed value — never clobber an existing real
      -- is_correct with NULL just because this particular call couldn't recompute one.
      is_correct = case
        when excluded.is_correct is not null then excluded.is_correct
        else picks.is_correct
      end,
      updated_at = now();
end;
$$;
