// One-off dev seed: fills in a plausible random spread for every game in the current
// draft week that's still missing one, so QA/testing can reach a publishable week
// without clicking through the Slate Builder UI game-by-game. Same justification as
// seed-dev-users.mjs — service_role here ONLY because this is a dev-time convenience
// script, never something the app itself calls at request time.
//
// Run: node --env-file=.env.local scripts/seed-dev-spreads.mjs [weekNumber]
// With no argument, targets whichever week is currently in "draft" state.
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

const weekNumberArg = process.argv[2] ? Number(process.argv[2]) : null;

let week;
if (weekNumberArg) {
  const { data, error } = await admin
    .from("weeks")
    .select("id, week_number, state")
    .eq("week_number", weekNumberArg)
    .single();
  if (error || !data) {
    console.error(`Couldn't find week ${weekNumberArg}:`, error?.message ?? "not found");
    process.exit(1);
  }
  week = data;
} else {
  const { data, error } = await admin
    .from("weeks")
    .select("id, week_number, state")
    .eq("state", "draft")
    .order("week_number", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    console.error("No week currently in draft state — pass a week number explicitly.");
    process.exit(1);
  }
  week = data;
}

const { data: games, error: gamesErr } = await admin
  .from("games")
  .select("id, away_team, home_team, spread")
  .eq("week_id", week.id)
  .neq("status", "voided")
  .is("spread", null);

if (gamesErr) {
  console.error("Couldn't load games:", gamesErr.message);
  process.exit(1);
}

if (games.length === 0) {
  console.log(`Week ${week.week_number}: every game already has a spread set. Nothing to do.`);
  process.exit(0);
}

// Plausible NFL spread range, half-point increments (no pick'em ties to keep test data simple).
const possibleSpreads = [-13.5, -10.5, -7.5, -6.5, -5.5, -4.5, -3, -2.5, -1.5, -1, 1, 1.5, 2.5, 3, 4.5];

for (const g of games) {
  const spread = possibleSpreads[Math.floor(Math.random() * possibleSpreads.length)];
  const { error } = await admin.from("games").update({ spread }).eq("id", g.id);
  if (error) {
    console.error(`Failed to set spread for ${g.away_team} @ ${g.home_team}:`, error.message);
  } else {
    console.log(`${g.away_team} @ ${g.home_team} — ${spread}`);
  }
}

console.log(`\nWeek ${week.week_number}: ${games.length} spread(s) seeded.`);
