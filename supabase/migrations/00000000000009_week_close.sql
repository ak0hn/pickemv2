-- PIC-12 (CT18): week.close(weekId) per the Week Lifecycle Spec's dual-caller contract.
-- One implementation, two callers — Epic 1's manual Close Week action (this ticket) and
-- Epic 7's automated game-final trigger (later). Scoring logic lives here only.
--
-- Idempotent: a second call on an already-closed week is a safe no-op (AC3) — no
-- duplicate scoring, no error. Postponed/void games are excluded from scoring entirely,
-- not blocking (games.status != 'final' is simply never selected).
--
-- ATS correctness and pick_value format (ENG architecture decision, not yet pinned
-- elsewhere — Epic 2's actual pick-submission UI doesn't exist yet, so this is the
-- first real consumer and sets the convention Epic 2 must match): pick_value stores a
-- team abbreviation equal to games.home_team or games.away_team. spread is the home
-- team's line (negative = home favored, per games.spread's existing comment). Home
-- covers when (home_score - away_score) + spread > 0; an exact push scores as
-- incorrect, per the league's confirmed "push doesn't count" default.

create function public.week_close(p_week_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state week_state;
  v_game record;
  v_margin numeric;
  v_home_covers boolean;
begin
  select state into v_state from public.weeks where id = p_week_id;
  if v_state is null then
    raise exception 'Week not found';
  end if;

  -- Idempotent no-op — already closed, nothing to do, not an error.
  if v_state = 'closed' then
    return;
  end if;

  for v_game in
    select id, home_team, away_team, home_score, away_score, spread
    from public.games
    where week_id = p_week_id and status = 'final'
  loop
    v_margin := (coalesce(v_game.home_score, 0) - coalesce(v_game.away_score, 0)) + coalesce(v_game.spread, 0);
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

grant execute on function public.week_close(uuid) to authenticated;
