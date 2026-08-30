-- Fix from live-testing week_close() (PIC-12): the foundation schema (PIC-10) declared
-- pick_value NOT NULL, but the Week Lifecycle Spec's own pick-state-machine explicitly
-- requires week_close() to insert pick_value = NULL for GMs who never submitted a pick
-- on a final game ("unset -> scored" transition, Decision 3). The constraint predates
-- that spec section being implemented and was never revisited — this is the fix.
alter table public.picks alter column pick_value drop not null;
