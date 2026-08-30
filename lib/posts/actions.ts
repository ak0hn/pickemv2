"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { OpenWeekBlock, CloseWeekBlock } from "@/lib/posts/types";

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

// Shared by every action here that needs "who is the signed-in commissioner" — was
// duplicated three times before (flagged in PIC-11's E4 review).
async function getCurrentRoster(supabase: SupabaseClient): Promise<{ id: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roster, error } = await supabase
    .from("roster")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (error || !roster) throw new Error("Couldn't find your roster record.");

  return roster;
}

// Builds CT17's Open Week block from the current slate — one row per game, sorted by
// kickoff. Called right before opening the composer, not stored until the post confirms.
export async function buildOpenWeekBlock(weekId: string): Promise<OpenWeekBlock> {
  const supabase = await createClient();

  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("week_number")
    .eq("id", weekId)
    .single();
  if (weekErr || !week) throw new Error("Couldn't load the week.");

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("away_team, home_team, spread, kickoff_at")
    .eq("week_id", weekId)
    .neq("status", "voided")
    .order("kickoff_at", { ascending: true });
  if (gamesErr) throw new Error(`Couldn't load the slate: ${gamesErr.message}`);

  return {
    type: "open_week",
    weekNumber: week.week_number,
    games: (games ?? []).map((g) => ({
      away: g.away_team,
      home: g.home_team,
      spread: g.spread,
      kickoffLabel: formatKickoff(g.kickoff_at),
    })),
  };
}

// CT4 + CT17 coupling: publishes the week and posts the announcement atomically via
// publish_week_with_post — see the migration for why this can't be two separate calls.
//
// Returns a result value rather than throwing for the RPC's own guard failures (missing
// spreads, already published, all-voided week) — these are expected errors in normal
// commish operation, not bugs. Next.js redacts thrown Server Action errors to a generic
// message in production regardless of client-side try/catch, so the RPC's actual,
// human-readable message (e.g. "3 games still need a spread before publishing") would
// never reach the commish otherwise. Per Next's own error-handling guidance: model
// expected errors as return values, reserve throw for genuinely unexpected failures.
export async function publishWeekWithPost(input: {
  weekId: string;
  message: string;
  block: OpenWeekBlock;
  imageUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const roster = await getCurrentRoster(supabase);

  const { error } = await supabase.rpc("publish_week_with_post", {
    p_week_id: input.weekId,
    p_author_roster_id: roster.id,
    p_message: input.message,
    p_block_data: input.block,
    p_image_url: input.imageUrl,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/commish");
  revalidatePath("/feed");
  return { ok: true };
}

// Builds CT18's Close Week block — per-game winners for this week, plus a season-to-date
// standings snapshot (top 5). There's no season-record table yet (that's Epic 5's League
// page) — this is a snapshot for the announcement post, not the authoritative source.
//
// Fixed in review (PIC-12 E4): this used to compute standings only from picks already at
// pick_status = 'scored' — but this block is built and previewed *before* the commish
// confirms, which is before week_close() has scored the week being closed. Every post
// would have shipped with the closing week's own results silently missing. Fix: derive
// correctness on the fly for 'submitted' picks (the same ATS formula week_close() will
// apply for real on confirm) instead of only trusting already-scored rows, and count a
// final game with no pick row at all as a loss — matching week_close()'s own "unset ->
// scored, is_correct = false" rule. This is a preview computed independently of the DB
// write, not a substitute for it; week_close() remains the only place that persists it.
export async function buildCloseWeekBlock(weekId: string): Promise<CloseWeekBlock> {
  const supabase = await createClient();

  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("week_number")
    .eq("id", weekId)
    .single();
  if (weekErr || !week) throw new Error("Couldn't load the week.");

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("away_team, home_team, spread, kickoff_at, status, home_score, away_score")
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

  const byRoster = new Map<string, { name: string; wins: number; losses: number; pushes: number }>();
  for (const r of roster ?? []) {
    const entry = { name: r.display_name ?? "Unknown", wins: 0, losses: 0, pushes: 0 };
    for (const g of finalGames ?? []) {
      if (g.home_score === null || g.away_score === null) continue;
      const margin = g.home_score - g.away_score + (g.spread ?? 0);
      const isPush = margin === 0;
      const pick = pickByRosterAndGame.get(`${r.id}|${g.id}`);

      if (!pick) {
        // No pick at all — always a loss, never a push, regardless of the game's margin.
        // "Didn't pick, doesn't count," same rule as a missed regular-season pick — a push
        // classification only applies to someone who actually made a pick on this game.
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
  const standings = [...byRoster.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 5);

  return { type: "close_week", weekNumber: week.week_number, games: gameRows, standings };
}

// CT18: closes the week and posts the results announcement atomically via
// close_week_with_post — same coupling as Open Week, per the e2e illustration doc (the
// real manual process treats closing + announcing results as one commish action).
//
// Fixed in review (PIC-12 E4): close_week_with_post now derives the author from auth.uid()
// server-side instead of trusting a caller-supplied roster id — the old signature let any
// caller post as a different commissioner. No getCurrentRoster call needed here anymore;
// the role/identity check happens inside the RPC (also fixed in the same review — the
// function previously had no commissioner check at all).
export async function closeWeekWithPost(input: {
  weekId: string;
  message: string;
  block: CloseWeekBlock;
  imageUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("close_week_with_post", {
    p_week_id: input.weekId,
    p_message: input.message,
    p_block_data: input.block,
    p_image_url: input.imageUrl,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/commish");
  revalidatePath("/feed");
  return { ok: true };
}

// Free-form post — no block, no coupling to any other action. The only trigger type
// that can be posted standalone, right now, with nothing else needing to exist first.
export async function createFreeformPost(input: { message: string; imageUrl: string | null }) {
  const supabase = await createClient();
  const roster = await getCurrentRoster(supabase);

  const { error } = await supabase.from("posts").insert({
    author_roster_id: roster.id,
    trigger: "freeform",
    message: input.message,
    image_url: input.imageUrl,
    block_data: null,
  });
  if (error) throw new Error(`Couldn't post: ${error.message}`);

  revalidatePath("/feed");
}

// Uploads to the post-images bucket under the caller's own roster-id folder (required
// by the storage RLS policy) and returns a public URL for the composer to preview /
// attach to the post it's about to create.
export async function uploadPostImage(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided.");

  const roster = await getCurrentRoster(supabase);

  // file.name.split(".").pop() returns the whole name (not undefined) when there's no
  // dot at all, so the ?? "jpg" fallback never triggers for a dotless filename — check
  // for a dot explicitly instead.
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${roster.id}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from("post-images").upload(path, file);
  if (uploadErr) throw new Error(`Couldn't upload image: ${uploadErr.message}`);

  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return data.publicUrl;
}
