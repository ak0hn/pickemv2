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
  if (Number.isNaN(Date.parse(input.kickoffAt))) {
    throw new Error("Kickoff time is invalid.");
  }

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

// CT4: publish the draft slate. Requires at least one game — publishing an empty week
// has no meaningful effect for GMs. Also guards against publishing a week that isn't
// actually in draft (e.g. already closed per CT18) — `closed` is meant to be terminal.
export async function publishWeek(weekId: string) {
  const supabase = await createClient();

  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("state")
    .eq("id", weekId)
    .single();

  if (weekErr || !week) throw new Error("Couldn't load the week.");
  if (week.state !== "draft") {
    throw new Error(`Can't publish a week that's already ${week.state}.`);
  }

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
