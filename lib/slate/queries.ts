import { createClient } from "@/lib/supabase/server";
import type { SlateData } from "@/lib/slate/types";

// PIC-30: resolves to the lowest-numbered week that isn't closed yet — weeks close in
// sequence (CT18/week.close), so this is always "the week currently being played,"
// without a hardcoded number. Replaces the old ACTIVE_WEEK_NUMBER=1 constant from PIC-10,
// which deliberately deferred real week-to-week advancement (flagged in PIC-12's review as
// a real risk "once week navigation arrives" — it arrived, via live 2-week E2E testing).
// Every single-active-week query (Slate/Close-Week tile, pick tracker, Picks page once
// built) should call this rather than re-deriving "which week is active" independently.
// Returns null once every seeded week is closed (end of season) — same "nothing to show"
// handling every caller already has for a missing week, not a new error path.
export async function getActiveWeekNumber(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weeks")
    .select("week_number")
    .neq("state", "closed")
    .order("week_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.week_number;
}

export async function getActiveSlate(): Promise<SlateData | null> {
  const supabase = await createClient();

  const weekNumber = await getActiveWeekNumber();
  if (weekNumber === null) return null;

  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("id, week_number, state, closed_at")
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (weekErr || !week) return null;

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id, week_id, away_team, home_team, spread, kickoff_at, status, home_score, away_score")
    .eq("week_id", week.id)
    .order("kickoff_at", { ascending: true });

  if (gamesErr) return null;

  return { week, games: games ?? [] };
}
