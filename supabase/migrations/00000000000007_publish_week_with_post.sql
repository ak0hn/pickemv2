-- PIC-11's Open Week trigger couples publishing the week with posting the announcement
-- (CT17's AC: canceling the composer must not silently complete the publish either).
-- Wraps both writes in one transaction, same pattern as PIC-10's apply_spread_edit —
-- a partial failure here (week published, no post; or post created, week still draft)
-- would be a real, confusing bug, not just an edge case.
create or replace function public.publish_week_with_post(
  p_week_id uuid,
  p_author_roster_id uuid,
  p_message text,
  p_block_data jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state week_state;
  v_missing_spread_count int;
  v_pickable_count int;
begin
  select state into v_state from public.weeks where id = p_week_id;
  if v_state is null then
    raise exception 'Week not found';
  end if;
  if v_state != 'draft' then
    raise exception 'Cannot publish a week that is already %', v_state;
  end if;

  select count(*) into v_pickable_count
  from public.games where week_id = p_week_id and status != 'voided';
  if v_pickable_count = 0 then
    raise exception 'Every game this week is voided — there is nothing for GMs to pick';
  end if;

  select count(*) into v_missing_spread_count
  from public.games where week_id = p_week_id and status != 'voided' and spread is null;
  if v_missing_spread_count > 0 then
    raise exception '% games still need a spread before publishing', v_missing_spread_count;
  end if;

  update public.weeks set state = 'published' where id = p_week_id;

  insert into public.posts (author_roster_id, week_id, trigger, message, block_data)
  values (p_author_roster_id, p_week_id, 'open_week', p_message, p_block_data);
end;
$$;

grant execute on function public.publish_week_with_post(uuid, uuid, text, jsonb) to authenticated;
