-- PIC-24 (Sep 7, 2026): week_close()'s "every non-voided game must be final" gate still
-- counted MNF, even though Epic 1's UI (WeekControlTile) already excludes MNF entirely
-- from both the visible slate and the "is the regular slate done" check (same session,
-- earlier fix) — MNF is the tiebreaker's domain (Epic 3), not part of the regular
-- week-close decision. Real commish flow hit this directly: reached Sunday final, the UI
-- correctly showed the Close Week action, but the RPC itself still blocked on MNF (kicks
-- off Monday, hours later) not being final yet.
--
-- Also fixes a latent bug in the scoring loop below: if MNF ever *is* already final at
-- close time, the loop's "insert a false/incorrect scored pick for anyone missing a pick
-- on this game" step would silently fabricate a loss for every roster member against MNF,
-- since nobody ever actually picks it (Confirmed Mechanics — MNF is never one of the 6
-- regular picks). Same fix applied to lib/results/compute.ts's finalGames query this same
-- session — both paths need to agree, not just the UI gate.
--
-- Same "kickoff is Monday in ET" heuristic as isMondayNightGame (lib/slate/format.ts) —
-- flagged there and on the Week Lifecycle Spec as a real open question for Epic 3 (no
-- is_tiebreaker_game concept exists yet), not solved here, just kept consistent with the
-- client-side behavior it must match.
create or replace function public.week_close(p_week_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state week_state;
  v_unfinished_count int;
  v_game record;
  v_margin numeric;
  v_home_covers boolean;
begin
  if not exists (
    select 1 from public.roster where auth_user_id = auth.uid() and role = 'commissioner'
  ) then
    raise exception 'Only the commissioner can close a week';
  end if;

  select state into v_state from public.weeks where id = p_week_id;
  if v_state is null then
    raise exception 'Week not found';
  end if;

  -- Idempotent no-op — already closed, nothing to do, not an error.
  if v_state = 'closed' then
    return;
  end if;

  select count(*) into v_unfinished_count
  from public.games
  where week_id = p_week_id
    and status not in ('final', 'voided')
    and extract(dow from (kickoff_at at time zone 'America/New_York')) <> 1;
  if v_unfinished_count > 0 then
    raise exception '% game(s) still in progress — close the week once every non-voided game is final', v_unfinished_count;
  end if;

  for v_game in
    select id, home_team, away_team, home_score, away_score, spread
    from public.games
    where week_id = p_week_id
      and status = 'final'
      and extract(dow from (kickoff_at at time zone 'America/New_York')) <> 1
  loop
    -- A 'final' game with a null score would fabricate a 0-0 result via coalesce below —
    -- skip it rather than score every pick against a result that was never actually
    -- entered (flagged in review; shouldn't be reachable once CT15 enforces both scores
    -- together, but this function shouldn't trust that).
    if v_game.home_score is null or v_game.away_score is null then
      continue;
    end if;

    v_margin := (v_game.home_score - v_game.away_score) + coalesce(v_game.spread, 0);
    v_home_covers := v_margin > 0; -- push (v_margin = 0) is not a cover — no credit either side

    -- Every roster member with no pick row on this game scores incorrect (unset -> scored).
    insert into public.picks (game_id, roster_id, pick_value, pick_status, is_correct)
    select v_game.id, r.id, null, 'scored', false
    from public.roster r
    where not exists (
      select 1 from public.picks p where p.game_id = v_game.id and p.roster_id = r.id
    );

    -- Submitted picks score against the result (submitted -> scored). Voided picks are
    -- left untouched — they're excluded from scoring, not counted as incorrect.
    update public.picks
    set pick_status = 'scored',
        is_correct = case
          when pick_value = v_game.home_team then v_home_covers
          when pick_value = v_game.away_team then not v_home_covers and v_margin <> 0
          else false
        end,
        updated_at = now()
    where game_id = v_game.id and pick_status = 'submitted';
  end loop;

  update public.weeks set state = 'closed', closed_at = now() where id = p_week_id;
end;
$$;
