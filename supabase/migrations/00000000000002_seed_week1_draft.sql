-- Seeds the first week as a draft so PIC-10's Slate Builder has something real to
-- operate against. Real season-schedule seeding (all weeks, all matchups) is out of
-- scope here — no importer exists yet; CT3's manual entry is how games get added to a
-- draft week for beta.
insert into public.weeks (week_number, state)
values (1, 'draft')
on conflict (week_number) do nothing;
