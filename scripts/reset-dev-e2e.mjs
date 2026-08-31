// One-off dev reset: restores a clean baseline across a range of weeks so a 2-week E2E
// test (PIC-30, Alex's live QA, Aug 31, 2026) can be restarted from scratch as many times
// as needed, instead of hand-editing the database between attempts. Same justification as
// the other seed-dev-*.mjs scripts — service_role here ONLY because this is a dev-time
// convenience script, never something the app itself calls at request time.
//
// For each week from 1 through <throughWeek> (default 3, covering a 2-week test plus the
// week after): deletes every pick and every post (open_week/close_week) tied to that
// week's games/week id, clears each game back to scheduled/no-spread/no-score, and resets
// the week itself to "draft" with closed_at cleared. Week 1 is always left as the active
// week to start from.
//
// Run: node --env-file=.env.local scripts/reset-dev-e2e.mjs [throughWeek]
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const throughWeek = process.argv[2] ? Number(process.argv[2]) : 3;

const { data: weeks, error: weeksErr } = await admin
  .from("weeks")
  .select("id, week_number")
  .lte("week_number", throughWeek)
  .order("week_number", { ascending: true });
if (weeksErr || !weeks || weeks.length === 0) {
  console.error("Couldn't load weeks to reset:", weeksErr?.message ?? "none found");
  process.exit(1);
}

for (const week of weeks) {
  const { data: games, error: gamesErr } = await admin
    .from("games")
    .select("id")
    .eq("week_id", week.id);
  if (gamesErr) {
    console.error(`Week ${week.week_number}: couldn't load games:`, gamesErr.message);
    continue;
  }
  const gameIds = (games ?? []).map((g) => g.id);

  if (gameIds.length > 0) {
    const { error: pickErr } = await admin.from("picks").delete().in("game_id", gameIds);
    if (pickErr) console.error(`Week ${week.week_number}: couldn't clear picks:`, pickErr.message);

    // Two steps, in this order, not one combined update: a DB trigger
    // (enforce_no_spread_edit_after_final, supabase/migrations/00000000000001_foundation.sql)
    // blocks changing `spread` on any row whose CURRENT status is 'final' — even when the
    // same statement also sets status away from 'final'. Clear status/scores first so the
    // row is no longer 'final' by the time the second update touches spread.
    const { error: statusResetErr } = await admin
      .from("games")
      .update({ status: "scheduled", home_score: null, away_score: null })
      .in("id", gameIds);
    if (statusResetErr) console.error(`Week ${week.week_number}: couldn't reset game status:`, statusResetErr.message);

    const { error: gameResetErr } = await admin
      .from("games")
      .update({ spread: null })
      .in("id", gameIds);
    if (gameResetErr) console.error(`Week ${week.week_number}: couldn't reset games:`, gameResetErr.message);
  }

  const { error: postErr } = await admin.from("posts").delete().eq("week_id", week.id);
  if (postErr) console.error(`Week ${week.week_number}: couldn't clear posts:`, postErr.message);

  const { error: weekResetErr } = await admin
    .from("weeks")
    .update({ state: "draft", closed_at: null })
    .eq("id", week.id);
  if (weekResetErr) console.error(`Week ${week.week_number}: couldn't reset week state:`, weekResetErr.message);

  console.log(`Week ${week.week_number}: reset to a clean draft (no spreads, no picks, no posts).`);
}

console.log(`\nDone — weeks 1-${throughWeek} reset. Week 1 is the active week again.`);
