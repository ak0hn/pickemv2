"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveSlate } from "@/lib/slate/queries";

// Thin server-action wrapper so the (client-rendered) Slate Builder can fetch/refetch
// without a page-level Server Component split — this app's commish page is already
// fully client-rendered for the dev persona/clock overrides.
export async function getActiveSlateAction() {
  return getActiveSlate();
}

// Same single-active-week scope as getActiveSlate (PIC-10's note applies here too — real
// season navigation across weeks is out of scope until later). Returns null when there's
// no week to show a Close Week control for at all (still draft) — WeekCloseControl treats
// that as "render nothing," not an error.
export async function getCloseableWeekAction(): Promise<{ id: string; state: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weeks")
    .select("id, state")
    .eq("week_number", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// CT2's pre-confirm check: does this game have picks that would be voided by an edit?
export async function checkSpreadEditImpact(gameId: string) {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("picks")
    .select("roster_id", { count: "exact" })
    .eq("game_id", gameId)
    .eq("pick_status", "submitted");

  if (error) throw new Error(`Couldn't check existing picks: ${error.message}`);
  // Prefer the exact `count` (unaffected by max_rows) over data.length.
  const affectedCount = count ?? data?.length ?? 0;
  return { hasExistingPicks: affectedCount > 0, affectedCount };
}

// CT2 / CT2b: edit a spread. Voiding existing picks and notifying affected GMs happens
// atomically with the spread update via a single Postgres function — see
// apply_spread_edit in the migrations. A partial failure (e.g. spread updates but the
// void/notify doesn't) would leave GMs with a stale pick and no idea it needs
// resubmitting, so this cannot be four independent client-side writes.
export async function applySpreadEdit(gameId: string, newSpread: number | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_spread_edit", {
    p_game_id: gameId,
    p_new_spread: newSpread,
  });

  if (error) {
    // The DB trigger blocks edits on already-scored games — surfaces here too, since
    // the trigger fires inside the same transaction as the RPC.
    throw new Error(`Couldn't update spread: ${error.message}`);
  }

  revalidatePath("/commish");
}

// CT4's publish is now always coupled with CT17's Open Week post (PIC-11) — see
// lib/posts/actions.ts's publishWeekWithPost and the publish_week_with_post migration,
// which owns the draft/pickable/missing-spread guards server-side inside the same
// transaction as the post. No standalone publish-without-a-post path exists anymore.
