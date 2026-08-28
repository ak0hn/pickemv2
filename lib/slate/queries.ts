import { createClient } from "@/lib/supabase/server";
import type { SlateData } from "@/lib/slate/types";

// PIC-10 works against a single active draft week (week 1) — real season-schedule
// seeding across all weeks is out of scope here; see the seed migration.
const ACTIVE_WEEK_NUMBER = 1;

export async function getActiveSlate(): Promise<SlateData | null> {
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

  return { week, games: games ?? [] };
}
