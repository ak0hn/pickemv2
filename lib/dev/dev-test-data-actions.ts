"use server";

import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getActiveWeekNumber } from "@/lib/slate/queries";

// Dev-only bridge exposing the seed-dev-*.mjs / reset-dev-e2e.mjs scripts as in-app dev
// tools bar actions, so Alex can drive/reset the 2-week E2E test scenario himself without
// a terminal — same underlying logic, just callable from the UI. Uses the service-role
// key to bypass RLS (necessary here: resetting/seeding test data is an admin operation
// with no real user session behind it, same justification as the standalone scripts this
// mirrors). Gated on VERCEL_ENV, same pattern as dev-auth-actions.ts — must never run in
// real production.
function assertDevOnly() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Dev test-data tools are dev-only and must not run in production");
  }
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createServiceRoleClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const POSSIBLE_SPREADS = [-13.5, -10.5, -7.5, -6.5, -5.5, -4.5, -3, -2.5, -1.5, -1, 1, 1.5, 2.5, 3, 4.5];

// Mirrors seed-dev-spreads.mjs + seed-dev-results.mjs combined: fills in any missing
// spreads, then marks every non-voided game in the given week final with a plausible
// score — one action to get straight to the "complete" tile state.
export async function devSeedWeekComplete(weekNumber?: number) {
  assertDevOnly();
  const admin = adminClient();
  const targetWeek = weekNumber ?? (await getActiveWeekNumber());
  if (targetWeek === null) throw new Error("No active week to seed.");

  const { data: week, error: weekErr } = await admin
    .from("weeks")
    .select("id")
    .eq("week_number", targetWeek)
    .single();
  if (weekErr || !week) throw new Error(`Couldn't find week ${targetWeek}: ${weekErr?.message ?? "not found"}`);

  const { data: games, error: gamesErr } = await admin
    .from("games")
    .select("id, spread")
    .eq("week_id", week.id)
    .neq("status", "voided");
  if (gamesErr) throw new Error(`Couldn't load games: ${gamesErr.message}`);

  for (const g of games ?? []) {
    if (g.spread === null) {
      const spread = POSSIBLE_SPREADS[Math.floor(Math.random() * POSSIBLE_SPREADS.length)];
      const { error } = await admin.from("games").update({ spread }).eq("id", g.id);
      if (error) throw new Error(`Couldn't set spread: ${error.message}`);
    }
  }

  for (const g of games ?? []) {
    const homeScore = Math.floor(Math.random() * 21) + 10;
    const awayScore = Math.floor(Math.random() * 21) + 10;
    const { error } = await admin
      .from("games")
      .update({ status: "final", home_score: homeScore, away_score: awayScore })
      .eq("id", g.id);
    if (error) throw new Error(`Couldn't mark game final: ${error.message}`);
  }

  revalidatePath("/commish");
  revalidatePath("/feed");
}

function coveringTeam(g: { status: string; home_score: number | null; away_score: number | null; spread: number | null; home_team: string; away_team: string }) {
  if (g.status !== "final" || g.home_score === null || g.away_score === null) return null;
  const margin = g.home_score - g.away_score + (g.spread ?? 0);
  if (margin === 0) return null;
  return margin > 0 ? g.home_team : g.away_team;
}

// Mirrors seed-dev-picks.mjs — 6 real picks per roster member for a target week (defaults
// to the active week), with an optional guaranteed 6/6 winner. Requires the week's games
// to already be final (run devSeedWeekComplete first).
export async function devSeedPicks(winnerEmail?: string, weekNumber?: number) {
  assertDevOnly();
  const admin = adminClient();
  const targetWeek = weekNumber ?? (await getActiveWeekNumber());
  if (targetWeek === null) throw new Error("No active week to seed picks for.");

  const { data: week, error: weekErr } = await admin
    .from("weeks")
    .select("id")
    .eq("week_number", targetWeek)
    .single();
  if (weekErr || !week) throw new Error(`Couldn't find week ${targetWeek}: ${weekErr?.message ?? "not found"}`);

  const { data: games, error: gamesErr } = await admin
    .from("games")
    .select("id, away_team, home_team, spread, kickoff_at, status, home_score, away_score")
    .eq("week_id", week.id)
    .neq("status", "voided")
    .order("kickoff_at", { ascending: true });
  if (gamesErr || !games || games.length === 0) throw new Error("Couldn't load games for this week.");
  if (games.some((g) => g.spread === null)) throw new Error("Not every game has a spread set yet.");

  const { data: roster, error: rosterErr } = await admin.from("roster").select("id, display_name, email");
  if (rosterErr || !roster || roster.length === 0) throw new Error("Couldn't load roster.");

  const nonPushGames = games.filter((g) => coveringTeam(g) !== null);
  if (winnerEmail && nonPushGames.length < 6) {
    throw new Error(
      `Only ${nonPushGames.length} non-push games this week — can't guarantee a 6/6 winner. Reseed results and try again.`,
    );
  }

  for (const person of roster) {
    const isWinner = !!winnerEmail && person.email === winnerEmail;
    const eligible = isWinner ? nonPushGames : games;
    const chosen = eligible.slice(0, 6);

    const rows = chosen.map((g, i) => {
      const cover = coveringTeam(g);
      let pickValue: string;
      if (isWinner && cover) {
        pickValue = cover;
      } else if (i === 0 && cover) {
        pickValue = cover === g.home_team ? g.away_team : g.home_team;
      } else {
        pickValue = cover ?? g.home_team;
      }
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
      .in(
        "game_id",
        chosen.map((g) => g.id),
      );
    if (delErr) throw new Error(`Couldn't clear existing picks for ${person.display_name}: ${delErr.message}`);

    const { error: insErr } = await admin.from("picks").insert(rows);
    if (insErr) throw new Error(`Couldn't seed picks for ${person.display_name}: ${insErr.message}`);
  }

  revalidatePath("/commish");
}

// Mirrors reset-dev-e2e.mjs — restores weeks 1 through throughWeek to a clean draft (no
// spreads, no picks, no posts), so the whole scenario can restart from scratch.
export async function devResetTestData(throughWeek = 3) {
  assertDevOnly();
  const admin = adminClient();

  const { data: weeks, error: weeksErr } = await admin
    .from("weeks")
    .select("id, week_number")
    .lte("week_number", throughWeek)
    .order("week_number", { ascending: true });
  if (weeksErr || !weeks || weeks.length === 0) throw new Error("Couldn't load weeks to reset.");

  for (const week of weeks) {
    const { data: games, error: gamesErr } = await admin.from("games").select("id").eq("week_id", week.id);
    if (gamesErr) throw new Error(`Week ${week.week_number}: couldn't load games: ${gamesErr.message}`);
    const gameIds = (games ?? []).map((g) => g.id);

    if (gameIds.length > 0) {
      const { error: pickErr } = await admin.from("picks").delete().in("game_id", gameIds);
      if (pickErr) throw new Error(`Week ${week.week_number}: couldn't clear picks: ${pickErr.message}`);

      // Same two-step order as reset-dev-e2e.mjs — a DB trigger blocks changing `spread`
      // while a row's CURRENT status is still 'final', even within the same statement.
      const { error: statusErr } = await admin
        .from("games")
        .update({ status: "scheduled", home_score: null, away_score: null })
        .in("id", gameIds);
      if (statusErr) throw new Error(`Week ${week.week_number}: couldn't reset game status: ${statusErr.message}`);

      const { error: spreadErr } = await admin.from("games").update({ spread: null }).in("id", gameIds);
      if (spreadErr) throw new Error(`Week ${week.week_number}: couldn't reset spreads: ${spreadErr.message}`);
    }

    const { error: postErr } = await admin.from("posts").delete().eq("week_id", week.id);
    if (postErr) throw new Error(`Week ${week.week_number}: couldn't clear posts: ${postErr.message}`);

    const { error: weekErr } = await admin.from("weeks").update({ state: "draft", closed_at: null }).eq("id", week.id);
    if (weekErr) throw new Error(`Week ${week.week_number}: couldn't reset week state: ${weekErr.message}`);
  }

  revalidatePath("/commish");
  revalidatePath("/feed");
}
