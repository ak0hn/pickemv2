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

// CT3 / CT1's disabled-stub area: manual game entry (also the only path in Epic 1 — the
// Odds API pull itself is CT1, stubbed until Epic 7).
export async function addGame(input: {
  weekId: string;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  spread: number | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("games").insert({
    week_id: input.weekId,
    away_team: input.awayTeam.toUpperCase(),
    home_team: input.homeTeam.toUpperCase(),
    kickoff_at: input.kickoffAt,
    spread: input.spread,
  });

  if (error) throw new Error(`Couldn't add game: ${error.message}`);
  revalidatePath("/commish");
}

// CT2's pre-confirm check: does this game have picks that would be voided by an edit?
export async function checkSpreadEditImpact(gameId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("picks")
    .select("roster_id", { count: "exact" })
    .eq("game_id", gameId)
    .eq("pick_status", "submitted");

  if (error) throw new Error(`Couldn't check existing picks: ${error.message}`);
  return { hasExistingPicks: (data?.length ?? 0) > 0, affectedCount: data?.length ?? 0 };
}

// CT2 / CT2b: edit a spread. If picks already exist for the game, void them and notify
// the affected GMs in the same action — the commish has already seen and confirmed the
// warning in the UI by the time this runs.
export async function applySpreadEdit(gameId: string, newSpread: number) {
  const supabase = await createClient();

  const { data: existingPicks, error: picksErr } = await supabase
    .from("picks")
    .select("id, roster_id")
    .eq("game_id", gameId)
    .eq("pick_status", "submitted");

  if (picksErr) throw new Error(`Couldn't load existing picks: ${picksErr.message}`);

  const { error: spreadErr } = await supabase
    .from("games")
    .update({ spread: newSpread, updated_at: new Date().toISOString() })
    .eq("id", gameId);

  if (spreadErr) {
    // The DB trigger blocks edits on already-scored games — surface that plainly.
    throw new Error(`Couldn't update spread: ${spreadErr.message}`);
  }

  if (existingPicks && existingPicks.length > 0) {
    const pickIds = existingPicks.map((p) => p.id);
    const { error: voidErr } = await supabase
      .from("picks")
      .update({ pick_status: "voided", updated_at: new Date().toISOString() })
      .in("id", pickIds);

    if (voidErr) throw new Error(`Couldn't void affected picks: ${voidErr.message}`);

    const notifications = existingPicks.map((p) => ({
      roster_id: p.roster_id,
      message: "Your pick for this game was cleared because the spread changed — resubmit before kickoff.",
    }));
    const { error: notifyErr } = await supabase.from("notifications").insert(notifications);
    if (notifyErr) throw new Error(`Couldn't notify affected GMs: ${notifyErr.message}`);
  }

  revalidatePath("/commish");
}

// CT4: publish the draft slate. Requires at least one game — publishing an empty week
// has no meaningful effect for GMs.
export async function publishWeek(weekId: string) {
  const supabase = await createClient();

  const { count, error: countErr } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("week_id", weekId);

  if (countErr) throw new Error(`Couldn't check the slate: ${countErr.message}`);
  if (!count || count === 0) {
    throw new Error("Add at least one game before publishing.");
  }

  const { error } = await supabase.from("weeks").update({ state: "published" }).eq("id", weekId);
  if (error) throw new Error(`Couldn't publish the week: ${error.message}`);
  revalidatePath("/commish");
}
