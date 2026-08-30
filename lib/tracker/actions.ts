"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveSlate } from "@/lib/slate/queries";
import type { TrackerData } from "@/lib/tracker/types";

// CT5: full initial snapshot for the pick tracker (week + games + roster + every pick).
// Live updates after this point come from the browser client's own Realtime subscription
// on public.picks — this action is only the first paint and the retry-on-error path.
//
// Reuses getActiveSlate() for the week+games half rather than re-querying — that
// function's own comment already flags every other single-active-week query needing to
// reference the same ACTIVE_WEEK_NUMBER constant instead of re-deriving it independently
// (E4 finding: this action originally duplicated that query verbatim).
export async function getPickTrackerAction(): Promise<TrackerData | null> {
  const slate = await getActiveSlate();
  if (!slate) return null;
  const { week, games } = slate;

  const supabase = await createClient();

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
