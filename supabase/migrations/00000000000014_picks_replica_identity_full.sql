-- PIC-14 (CT5) E4 fix: without REPLICA IDENTITY FULL, a DELETE event's payload.old
-- carries only the primary key (id), not game_id/roster_id — the pick tracker's live
-- subscription can't tell which cell to clear. Picks are voided via UPDATE today, not
-- deleted, so this was a dead path in practice, but the table should be set up correctly
-- for all three Realtime event types regardless.
alter table public.picks replica identity full;
