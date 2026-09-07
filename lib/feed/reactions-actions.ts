"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Mirrors the getCurrentRoster pattern in lib/posts/actions.ts — not imported across
// files since that helper isn't exported; a few duplicated lines here is preferable to
// widening that file's public surface for one caller.
async function getCurrentRosterId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
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

  return roster.id;
}

// PIC-32/NF3: a GM reacting again on a post they've already reacted to removes the
// reaction (toggle, not a second reaction) — checked here at the app layer before the
// insert/delete, backstopped by the reactions table's own unique(post_id, roster_id)
// constraint against a race producing a duplicate.
export async function toggleReaction(postId: string): Promise<{ reacted: boolean }> {
  const supabase = await createClient();
  const rosterId = await getCurrentRosterId(supabase);

  const { data: existing, error: findErr } = await supabase
    .from("reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("roster_id", rosterId)
    .maybeSingle();
  if (findErr) throw new Error(`Couldn't check your reaction: ${findErr.message}`);

  if (existing) {
    const { error: delErr } = await supabase.from("reactions").delete().eq("id", existing.id);
    if (delErr) throw new Error(`Couldn't remove your reaction: ${delErr.message}`);
    revalidatePath("/feed");
    return { reacted: false };
  }

  const { error: insErr } = await supabase
    .from("reactions")
    .insert({ post_id: postId, roster_id: rosterId });
  if (insErr) throw new Error(`Couldn't add your reaction: ${insErr.message}`);
  revalidatePath("/feed");
  return { reacted: true };
}

export interface ReactionSummary {
  count: number;
  viewerReacted: boolean;
}

export interface Reactor {
  rosterId: string;
  name: string;
}

// PIC-32/NF6 (E4 finding — this was entirely missing): a commissioner can delete any
// reaction, but that requires knowing WHO reacted first — the primary display is
// deliberately count-only (101 GMs makes a persistent name list unmanageable), so
// identifying an individual reaction to moderate needs an on-demand, per-post fetch, not
// eager loading for every post like getReactionSummaries. Called only when a viewer
// actually opens the "who reacted" sheet for one specific post.
export async function getReactors(postId: string): Promise<Reactor[]> {
  const supabase = await createClient();

  const { data: reactions, error } = await supabase
    .from("reactions")
    .select("roster_id")
    .eq("post_id", postId);
  if (error) throw new Error(`Couldn't load reactions: ${error.message}`);
  if (!reactions || reactions.length === 0) return [];

  const rosterIds = reactions.map((r) => r.roster_id);
  const { data: roster, error: rosterErr } = await supabase
    .from("roster")
    .select("id, display_name")
    .in("id", rosterIds);
  if (rosterErr) throw new Error(`Couldn't load reactor names: ${rosterErr.message}`);

  return (roster ?? []).map((r) => ({ rosterId: r.id, name: r.display_name ?? "Unknown" }));
}

// PIC-32/NF6: moderator delete — removes a specific GM's reaction on a post regardless of
// who's calling this, relying entirely on the reactions_delete_own_or_commissioner RLS
// policy to actually enforce "own or commissioner" at the DB layer. This function makes no
// role check of its own on purpose — duplicating that check here would just be a second,
// potentially-drifting copy of what RLS already guarantees; if RLS denies, the delete
// affects zero rows and Supabase reports no error, so the caller-side UI (see
// ReactorsSheet) is what's actually responsible for only showing this action to
// commissioner viewers in the first place.
export async function deleteReaction(postId: string, rosterId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reactions")
    .delete()
    .eq("post_id", postId)
    .eq("roster_id", rosterId);
  if (error) throw new Error(`Couldn't remove that reaction: ${error.message}`);
  revalidatePath("/feed");
}

// Batched — one query for every visible post's reactions, not one query per PostCard
// (the feed shows N posts at once; N+1 queries here would scale with feed length).
// Called once by app/feed/page.tsx alongside getFeedPosts(), not from inside PostCard.
export async function getReactionSummaries(
  postIds: string[]
): Promise<Record<string, ReactionSummary>> {
  if (postIds.length === 0) return {};

  const supabase = await createClient();
  const rosterId = await getCurrentRosterId(supabase);

  const { data: reactions, error } = await supabase
    .from("reactions")
    .select("post_id, roster_id")
    .in("post_id", postIds);
  if (error) throw new Error(`Couldn't load reactions: ${error.message}`);

  const summaries: Record<string, ReactionSummary> = {};
  for (const id of postIds) {
    summaries[id] = { count: 0, viewerReacted: false };
  }
  for (const r of reactions ?? []) {
    const entry = summaries[r.post_id];
    if (!entry) continue; // shouldn't happen — defensive against a stale/unknown post_id
    entry.count += 1;
    if (r.roster_id === rosterId) entry.viewerReacted = true;
  }
  return summaries;
}
