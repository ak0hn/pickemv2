"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OpenWeekBlock } from "@/lib/posts/types";

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
export async function publishWeekWithPost(input: {
  weekId: string;
  message: string;
  block: OpenWeekBlock;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roster, error: rosterErr } = await supabase
    .from("roster")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (rosterErr || !roster) throw new Error("Couldn't find your roster record.");

  const { error } = await supabase.rpc("publish_week_with_post", {
    p_week_id: input.weekId,
    p_author_roster_id: roster.id,
    p_message: input.message,
    p_block_data: input.block,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/commish");
  revalidatePath("/feed");
}

// Free-form post — no block, no coupling to any other action. The only trigger type
// that can be posted standalone, right now, with nothing else needing to exist first.
export async function createFreeformPost(input: { message: string; imageUrl: string | null }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roster, error: rosterErr } = await supabase
    .from("roster")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (rosterErr || !roster) throw new Error("Couldn't find your roster record.");

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roster, error: rosterErr } = await supabase
    .from("roster")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (rosterErr || !roster) throw new Error("Couldn't find your roster record.");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${roster.id}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from("post-images").upload(path, file);
  if (uploadErr) throw new Error(`Couldn't upload image: ${uploadErr.message}`);

  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return data.publicUrl;
}
