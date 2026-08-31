"use server";

import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/results/format";
import type { WeekResults } from "@/lib/results/types";

// PIC-24: read-only results/standings computation, decoupled from week_close(). Extracted
// from lib/posts/actions.ts's buildCloseWeekBlock (PIC-12/22) — same ATS formula, same
// "derive correctness on the fly for still-'submitted' picks" approach. This function
// performs no writes and never calls week_close() — safe to call any number of times, at
// any point after some games are final (including after the week is actually closed), with
// no side effects. Note: pushes are a display-layer enrichment derived from game margins,
// not a persisted state — week_close() itself only ever writes is_correct = true/false, so
// standings computed here are not byte-for-byte identical to raw picks-table state, only to
// the same win/loss/push classification week_close() effectively encodes.
// Standings here are the full league, unsliced — callers that want a shorter list (e.g.
// buildCloseWeekBlock's top-5 announcement snippet) slice the result themselves.
export async function computeWeekResults(weekId: string): Promise<WeekResults> {
  const supabase = await createClient();

  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("week_number")
    .eq("id", weekId)
    .single();
  if (weekErr || !week) throw new Error("Couldn't load the week.");

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id, away_team, home_team, spread, kickoff_at, status, home_score, away_score")
    .eq("week_id", weekId)
    .neq("status", "voided")
    .order("kickoff_at", { ascending: true });
  if (gamesErr) throw new Error(`Couldn't load the slate: ${gamesErr.message}`);

  const gameRows = (games ?? []).map((g) => {
    let winner: "away" | "home" | "push" | null = null;
    if (g.status === "final" && g.home_score !== null && g.away_score !== null) {
      const margin = g.home_score - g.away_score + (g.spread ?? 0);
      winner = margin === 0 ? "push" : margin > 0 ? "home" : "away";
    }
    return {
      away: g.away_team,
      home: g.home_team,
      spread: g.spread,
      kickoffLabel: formatKickoff(g.kickoff_at),
      winner,
    };
  });

  const { data: roster, error: rosterErr } = await supabase.from("roster").select("id, display_name");
  if (rosterErr) throw new Error(`Couldn't load roster: ${rosterErr.message}`);

  const { data: finalGames, error: finalGamesErr } = await supabase
    .from("games")
    .select("id, home_team, away_team, home_score, away_score, spread")
    .eq("status", "final");
  if (finalGamesErr) throw new Error(`Couldn't load results: ${finalGamesErr.message}`);

  const { data: picks, error: picksErr } = await supabase
    .from("picks")
    .select("roster_id, game_id, pick_value, pick_status, is_correct")
    .in("pick_status", ["scored", "submitted"])
    .in(
      "game_id",
      (finalGames ?? []).map((g) => g.id)
    );
  if (picksErr) throw new Error(`Couldn't load standings: ${picksErr.message}`);

  const pickByRosterAndGame = new Map(picks?.map((p) => [`${p.roster_id}|${p.game_id}`, p]) ?? []);

  const byRoster = new Map<string, { rosterId: string; name: string; wins: number; losses: number; pushes: number }>();
  for (const r of roster ?? []) {
    const entry = { rosterId: r.id, name: r.display_name ?? "Unknown", wins: 0, losses: 0, pushes: 0 };
    for (const g of finalGames ?? []) {
      if (g.home_score === null || g.away_score === null) continue;
      const margin = g.home_score - g.away_score + (g.spread ?? 0);
      const isPush = margin === 0;
      const pick = pickByRosterAndGame.get(`${r.id}|${g.id}`);

      if (!pick || pick.pick_value === null) {
        // No pick row at all (pre-close), or the synthetic null-value row week_close()
        // inserts for a GM who never picked (post-close) — both mean "didn't pick," always
        // a loss, never a push, regardless of the game's margin. Without the pick_value
        // check, a post-close push game misread the synthetic row as an actual pick that
        // matched neither team, which happened to land on the "else false" branch below and
        // get credited as a push instead of a loss (E4 finding).
        entry.losses++;
        continue;
      }

      const isCorrect =
        pick.pick_status === "scored"
          ? (pick.is_correct ?? false) // trust the persisted result
          : pick.pick_value === g.home_team // 'submitted' — derive the same way week_close() will on confirm
            ? margin > 0
            : pick.pick_value === g.away_team
              ? margin < 0
              : false;

      if (isCorrect) entry.wins++;
      else if (isPush) entry.pushes++;
      else entry.losses++;
    }
    byRoster.set(r.id, entry);
  }
  const standings = [...byRoster.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  // Weekly winners (Aug 31, 2026): who went 6/6 on THIS week's own picks specifically —
  // a different question from `standings`, which is season-to-date cumulative. Reuses
  // the same finalGames/pick data above, just scoped down to this week's own game ids
  // rather than every final game system-wide.
  const thisWeekGameIds = new Set((games ?? []).map((g) => g.id));
  const thisWeekFinalGames = (finalGames ?? []).filter((g) => thisWeekGameIds.has(g.id));
  const weeklyCorrectCount = new Map<string, number>();
  for (const r of roster ?? []) {
    let correct = 0;
    for (const g of thisWeekFinalGames) {
      if (g.home_score === null || g.away_score === null) continue;
      const margin = g.home_score - g.away_score + (g.spread ?? 0);
      const pick = pickByRosterAndGame.get(`${r.id}|${g.id}`);
      if (!pick || pick.pick_value === null) continue;
      const isCorrect =
        pick.pick_status === "scored"
          ? (pick.is_correct ?? false)
          : pick.pick_value === g.home_team
            ? margin > 0
            : pick.pick_value === g.away_team
              ? margin < 0
              : false;
      if (isCorrect) correct++;
    }
    weeklyCorrectCount.set(r.id, correct);
  }
  // 6/6 is the league's fixed weekly pick count (WP2) — a perfect week, not merely the
  // highest score that week (Confirmed Mechanics: ties all stay co-winners without a
  // tiebreaker; nobody "wins" a week going 5/6).
  const weeklyWinners = (roster ?? [])
    .filter((r) => weeklyCorrectCount.get(r.id) === 6)
    .map((r) => r.display_name ?? "Unknown");

  return { weekNumber: week.week_number, games: gameRows, standings, weeklyWinners };
}
