"use server";

import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WEEK_NUMBER } from "@/lib/slate/queries";
import type { TrackerData } from "@/lib/tracker/types";

// CT5: full initial snapshot for the pick tracker (week + games + roster + every pick).
// Live updates after this point come from the browser client's own Realtime subscription
// on public.picks — this action is only the first paint and the retry-on-error path.
export async function getPickTrackerAction(): Promise<TrackerData | null> {
  const supabase = await createClient();

  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("id, week_number, state, closed_at")
    .eq("week_number", ACTIVE_WEEK_NUMBER)
    .maybeSingle();
  if (weekErr || !week) return null;

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id, week_id, away_team, home_team, spread, kickoff_at, status, home_score, away_score")
    .eq("week_id", week.id)
    .order("kickoff_at", { ascending: true });
  if (gamesErr) return null;

  // Every roster member is a potential picker, including the commissioner (Confirmed
  // Mechanics: "the commish uses the same GM pick flow — no special case").
  const { data: roster, error: rosterErr } = await supabase
    .from("roster")
    .select("id, display_name, email")
    .order("display_name", { ascending: true });
  if (rosterErr) return null;

  const gameIds = (games ?? []).map((g) => g.id);
  const { data: picks, error: picksErr } = gameIds.length
    ? await supabase
        .from("picks")
        .select("game_id, roster_id, pick_value, pick_status")
        .in("game_id", gameIds)
    : { data: [], error: null };
  if (picksErr) return null;

  return {
    week,
    games: games ?? [],
    roster: roster ?? [],
    picks: picks ?? [],
  };
}
