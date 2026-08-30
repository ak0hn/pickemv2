-- Fixes from PIC-12's E4 review:
-- 1. No commissioner-role check — week_close was security invoker with EXECUTE granted
--    to authenticated, meaning any signed-in GM could call it directly via the RPC
--    endpoint and bypass the commish page entirely. Added a role check at the shared
--    entry point so both callers (manual UI, Epic 7's future automated trigger) inherit
--    it — matches "one implementation, two callers."
-- 2. week_close closed the week unconditionally, regardless of whether any non-voided
--    game was still not final. A premature close (e.g. commish closes while MNF is still
--    live) permanently stranded those picks at pick_status = 'submitted' forever, since
--    the idempotency check exits immediately on any later call. Now raises instead of
--    silently closing with games unresolved.
-- Recreates rather than CREATE OR REPLACE since the body changes materially and this
-- keeps the diff readable as one unit — signature is unchanged so no drop needed.
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
  where week_id = p_week_id and status not in ('final', 'voided');
  if v_unfinished_count > 0 then
    raise exception '% game(s) still in progress — close the week once every non-voided game is final', v_unfinished_count;
  end if;

  for v_game in
    select id, home_team, away_team, home_score, away_score, spread
    from public.games
    where week_id = p_week_id and status = 'final'
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

-- close_week_with_post no longer accepts an author roster id from the caller — deriving
-- it from auth.uid() instead prevents a caller from posting as someone else (impersonation
-- surface flagged in the same review, separate from the missing role check above: once
-- role is enforced, a commissioner could still forge p_author_roster_id to post as a
-- different commissioner in a multi-commish league). Different signature (one fewer
-- param) than the original, so the old one must be dropped first — CREATE OR REPLACE
-- would otherwise leave both overloads callable, including the vulnerable one.
drop function if exists public.close_week_with_post(uuid, uuid, text, jsonb, text);

create function public.close_week_with_post(
  p_week_id uuid,
  p_message text,
  p_block_data jsonb,
  p_image_url text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_author_roster_id uuid;
begin
  select id into v_author_roster_id from public.roster where auth_user_id = auth.uid();
  if v_author_roster_id is null then
    raise exception 'Not signed in';
  end if;

  perform public.week_close(p_week_id);

  insert into public.posts (author_roster_id, week_id, trigger, message, block_data, image_url)
  values (v_author_roster_id, p_week_id, 'close_week', p_message, p_block_data, p_image_url);
end;
$$;

grant execute on function public.close_week_with_post(uuid, text, jsonb, text) to authenticated;
