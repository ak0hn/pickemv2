// One-off dev seed: marks games in a week as final with scores, so week_close() can be
// tested without CT15 (manual result entry, PIC-18) existing yet — same justification as
// seed-dev-spreads.mjs. PIC-18 will replace this dev-script path with the real UI later;
// week_close() itself doesn't change.
//
// Run: node --env-file=.env.local scripts/seed-dev-results.mjs [weekNumber]
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

const weekNumber = process.argv[2] ? Number(process.argv[2]) : 1;

const { data: week, error: weekErr } = await admin
  .from("weeks")
  .select("id, week_number, state")
  .eq("week_number", weekNumber)
  .single();
if (weekErr || !week) {
  console.error(`Couldn't find week ${weekNumber}:`, weekErr?.message ?? "not found");
  process.exit(1);
}

const { data: games, error: gamesErr } = await admin
  .from("games")
  .select("id, away_team, home_team, spread")
  .eq("week_id", week.id)
  .neq("status", "voided");
if (gamesErr) {
  console.error("Couldn't load games:", gamesErr.message);
  process.exit(1);
}

for (const g of games) {
  // Deterministic-ish plausible scores: home team wins by roughly the spread amount,
  // occasionally landing exactly on it to exercise the push path.
  const homeScore = 20 + Math.floor(Math.random() * 10);
  const pushThisOne = Math.random() < 0.15;
  const margin = pushThisOne ? -(g.spread ?? 0) : -(g.spread ?? 0) + (Math.random() < 0.5 ? 3 : -3);
  const awayScore = Math.max(0, homeScore - margin);
  const { error } = await admin
    .from("games")
    .update({ status: "final", home_score: homeScore, away_score: Math.round(awayScore) })
    .eq("id", g.id);
  if (error) console.error(`Failed to finalize ${g.away_team} @ ${g.home_team}:`, error.message);
  else console.log(`${g.away_team} @ ${g.home_team}: ${Math.round(awayScore)}-${homeScore}${pushThisOne ? " (push)" : ""}`);
}

console.log(`\nWeek ${weekNumber}: ${games.length} game(s) marked final.`);
