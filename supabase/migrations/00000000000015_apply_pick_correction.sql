-- PIC-15 (CT6): commissioner pick correction. Single atomic function so a correction on
-- an already-scored pick recomputes is_correct immediately (AC: "the corrected value is
-- used for scoring immediately") rather than requiring a second write from the client —
-- same "one implementation, no split writes" reasoning as apply_spread_edit and
-- week_close.
--
-- Upsert, not update-only: a roster member who never picked has no row at all before
-- week_close() runs (unset state) — the commish must be able to enter a pick on their
-- behalf too, not just correct an existing one.
--
-- Only ever mutates pick_value (and is_correct, when recomputable) — never pick_status.
-- On an existing row this is enforced by the ON CONFLICT SET clause simply omitting
-- pick_status, so it retains whatever value it already had (submitted/voided/scored).
--
-- KNOWN GAP, not implemented here (per PIC-15's DoD — flagged, not silently dropped):
-- the AC's tiebreaker-protection branch ("a correction must not retroactively reopen an
-- already-resolved tiebreaker's weekly winner") has no mechanism to protect yet, because
-- no tiebreaker-resolution concept exists until Epic 3 ships. This is logged as a
-- required Epic 1+3 boundary integration test (see PIC-15's DoD) — do not consider this
-- function complete against that AC until Epic 3 adds a tiebreaker-resolved state this
-- function can check against.
create function public.apply_pick_correction(
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

  -- Recompute is_correct immediately if the game is already final — same margin logic as
  -- week_close(), duplicated rather than shared because week_close() operates on a whole
  -- week's games in a loop and this operates on one game/one pick; both must independently
  -- stay in sync with the ATS convention documented on games.spread.
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
      is_correct = excluded.is_correct,
      updated_at = now();
end;
$$;

grant execute on function public.apply_pick_correction(uuid, uuid, text) to authenticated;
