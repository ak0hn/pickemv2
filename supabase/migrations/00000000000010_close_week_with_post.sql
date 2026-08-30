-- Manual Close Week action (CT18, AC2) couples the close with an announcement post,
-- same pattern as publish_week_with_post — per the e2e illustration doc, the real
-- manual process treats "closing the week" and "posting results to the league" as one
-- commish action, not two. Wraps week_close() rather than duplicating its scoring logic
-- — Epic 7's automated path (AC1) calls week_close() directly, with no post, since that
-- path is explicitly "no separate commish action required."
create function public.close_week_with_post(
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
begin
  perform public.week_close(p_week_id);

  insert into public.posts (author_roster_id, week_id, trigger, message, block_data, image_url)
  values (p_author_roster_id, p_week_id, 'close_week', p_message, p_block_data, p_image_url);
end;
$$;

grant execute on function public.close_week_with_post(uuid, uuid, text, jsonb, text) to authenticated;
