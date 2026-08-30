-- PIC-14 (CT5): pick tracker needs live delivery of pick submissions to the commish
-- view. Existing RLS on public.picks (picks_select_own_or_commissioner) already scopes
-- what a commissioner can see — Realtime enforces the same row-level security on
-- postgres_changes payloads, so adding the table to the publication doesn't widen who
-- can read what; it just adds a live delivery channel on top of the same policy.
alter publication supabase_realtime add table public.picks;
