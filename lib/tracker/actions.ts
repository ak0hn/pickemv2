"use server";

import { revalidatePath } from "next/cache";
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

// CT6: commissioner pick correction, inline from the CT5 grid. Thrown as { ok, error }
// rather than a real throw (client code must re-throw from this to surface the real
// message — Next redacts thrown Server Action errors to a generic message in production,
// same fix as PIC-11/PIC-12's publish/close-week paths) so the correction sheet can show
// the RPC's actual validation message (e.g. "must be one of the two teams playing").
export async function applyPickCorrection(input: {
  gameId: string;
  rosterId: string;
  pickValue: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("apply_pick_correction", {
    p_game_id: input.gameId,
    p_roster_id: input.rosterId,
    p_pick_value: input.pickValue,
  });
  if (error) return { ok: false, error: error.message };

  // The pick tracker's own Realtime subscription (PIC-14) picks up the row change
  // directly — this revalidation covers server-rendered surfaces only.
  revalidatePath("/commish");
  return { ok: true };
}
