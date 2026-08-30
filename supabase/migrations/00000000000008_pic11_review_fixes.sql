-- Fixes from PIC-11's E4 review:
-- 1. publish_week_with_post was missing an image_url parameter entirely — an image
--    attached to an Open Week post was silently discarded (uploaded to Storage, but
--    never referenced from the post row). Adding a parameter changes the function's
--    signature, so this drops and recreates rather than CREATE OR REPLACE (which only
--    works when the signature is unchanged).
-- 2. Missing DELETE policy on storage.objects — uploaded images had no cleanup path,
--    including ones abandoned by a canceled composer.

drop function if exists public.publish_week_with_post(uuid, uuid, text, jsonb);

create function public.publish_week_with_post(
  p_week_id uuid,
  p_author_roster_id uuid,
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

  insert into public.posts (author_roster_id, week_id, trigger, message, block_data, image_url)
  values (p_author_roster_id, p_week_id, 'open_week', p_message, p_block_data, p_image_url);
end;
$$;

grant execute on function public.publish_week_with_post(uuid, uuid, text, jsonb, text) to authenticated;

create policy post_images_commissioner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'post-images'
    and public.is_commissioner()
    and (storage.foldername(name))[1] = public.current_roster_id()::text
  );
