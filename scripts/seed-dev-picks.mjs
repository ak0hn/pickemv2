// One-off dev seed: inserts 6 realistic submitted picks per roster member for a target
// week, so a 2-week E2E test scenario (PIC-30, Alex's live QA, Aug 31, 2026) can include
// a real "who went 6/6" outcome without waiting on Epic 2's actual pick-submission UI,
// which doesn't exist yet. Same justification as the other seed-dev-*.mjs scripts —
// service_role here ONLY because this is a dev-time convenience script, never something
// the app itself calls at request time.
//
// Requires the target week's games to already have spreads set (seed-dev-spreads.mjs) and,
// for a deterministic winner/non-winner outcome, already be marked final
// (seed-dev-results.mjs) — correctness is computed from the real recorded result, not
// guessed. Picks the week's first 6 non-voided games by kickoff time (matches the real
// product rule: a GM picks 6 of the full slate, WP2).
//
// Run: node --env-file=.env.local scripts/seed-dev-picks.mjs <weekNumber> [--all-correct=<email>]
// --all-correct names one roster email that should go 6/6 (skips push games when picking
// which 6 to use, so a real win is achievable). Every other roster member gets a
// deliberately-wrong pick on the first game — guarantees they're NOT 6/6, so a two-week
// test can reliably show "one winner" vs "no winner" by just varying who --all-correct
// names (or omitting it entirely for a no-winner week).
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

const weekNumberArg = Number(process.argv[2]);
if (!weekNumberArg) {
  console.error("Usage: node --env-file=.env.local scripts/seed-dev-picks.mjs <weekNumber> [--all-correct=<email>]");
  process.exit(1);
}
const allCorrectFlag = process.argv.find((a) => a.startsWith("--all-correct="));
const allCorrectEmail = allCorrectFlag ? allCorrectFlag.split("=")[1] : null;

const { data: week, error: weekErr } = await admin
  .from("weeks")
  .select("id, week_number")
  .eq("week_number", weekNumberArg)
  .single();
if (weekErr || !week) {
  console.error(`Couldn't find week ${weekNumberArg}:`, weekErr?.message ?? "not found");
  process.exit(1);
}

const { data: games, error: gamesErr } = await admin
  .from("games")
  .select("id, away_team, home_team, spread, kickoff_at, status, home_score, away_score")
  .eq("week_id", week.id)
  .neq("status", "voided")
  .order("kickoff_at", { ascending: true });
if (gamesErr || !games || games.length === 0) {
  console.error("Couldn't load games for this week:", gamesErr?.message ?? "no games found");
  process.exit(1);
}
if (games.some((g) => g.spread === null)) {
  console.error("Not every game has a spread set yet — run seed-dev-spreads.mjs first.");
  process.exit(1);
}

const { data: roster, error: rosterErr } = await admin.from("roster").select("id, display_name, email");
if (rosterErr || !roster || roster.length === 0) {
  console.error("Couldn't load roster:", rosterErr?.message ?? "no roster found");
  process.exit(1);
}

function coveringTeam(g) {
  if (g.status !== "final" || g.home_score === null || g.away_score === null) return null;
  const margin = g.home_score - g.away_score + (g.spread ?? 0);
  if (margin === 0) return null; // push — no covering side
  return margin > 0 ? g.home_team : g.away_team;
}

// E4 finding: computed once, up front — if the intended winner can't actually reach 6/6
// (too many push games this week), fail loudly here rather than let chosen.length < 6
// silently produce a no-winner week despite --all-correct being set.
const nonPushGames = games.filter((g) => coveringTeam(g) !== null);
if (allCorrectEmail !== null && nonPushGames.length < 6) {
  console.error(
    `Only ${nonPushGames.length} non-push games this week — can't guarantee a 6/6 winner. ` +
      `Re-run seed-dev-results.mjs to reroll scores, then try again.`,
  );
  process.exit(1);
}

for (const person of roster) {
  const isWinner = allCorrectEmail !== null && person.email === allCorrectEmail;

  // Prefer non-push games so a genuine 6/6 is achievable for the winner; anyone else just
  // takes the first 6 in kickoff order.
  const eligible = isWinner ? nonPushGames : games;
  const chosen = eligible.slice(0, 6);

  const rows = chosen.map((g, i) => {
    const cover = coveringTeam(g);
    let pickValue;
    if (isWinner && cover) {
      pickValue = cover;
    } else if (i === 0 && cover) {
      // Deliberately wrong on the first pick — guarantees this person is not 6/6.
      pickValue = cover === g.home_team ? g.away_team : g.home_team;
    } else {
      pickValue = cover ?? g.home_team; // game not final yet — any valid team value
    }
    // E4 finding: a push (cover === null) must stay is_correct = null — neither side
    // covers, so it's excluded from scoring, not a loss. Previously fell through to
    // `pickValue === cover` (=== null), which evaluated to false and made a push read as
    // an active wrong pick for anyone not deliberately failing game 0.
    const isCorrect = g.status !== "final" ? null : cover === null ? null : pickValue === cover;
    return {
      roster_id: person.id,
      game_id: g.id,
      pick_value: pickValue,
      pick_status: g.status === "final" ? "scored" : "submitted",
      is_correct: isCorrect,
    };
  });

  const { error: delErr } = await admin
    .from("picks")
    .delete()
    .eq("roster_id", person.id)
    .in("game_id", chosen.map((g) => g.id));
  if (delErr) {
    console.error(`Couldn't clear existing picks for ${person.display_name}:`, delErr.message);
    continue;
  }

  const { error: insErr } = await admin.from("picks").insert(rows);
  if (insErr) {
    console.error(`Couldn't seed picks for ${person.display_name}:`, insErr.message);
    continue;
  }
  console.log(`${person.display_name}: ${rows.length} picks seeded${isWinner ? " (targeting 6/6)" : ""}.`);
}

console.log(`\nWeek ${week.week_number}: picks seeded.`);
