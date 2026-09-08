"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Mirrors the getCurrentRoster pattern in lib/posts/actions.ts / lib/feed/reactions-actions.ts
// — not imported across files since neither exports it; a few duplicated lines here is
// preferable to widening those files' public surface for one caller. Returns display_name
// too (unlike reactions' version) since addComment needs the author's name back immediately
// for the caller to render the new comment without a second round-trip.
async function getCurrentRoster(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string; displayName: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roster, error } = await supabase
    .from("roster")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .single();
  if (error || !roster) throw new Error("Couldn't find your roster record.");

  return { id: roster.id, displayName: roster.display_name ?? "Unknown" };
}

export interface Comment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  // Computed server-side against the current signed-in roster — never expose raw roster
  // ids to the client for this comparison, same principle as reactions' viewerReacted.
  isOwn: boolean;
}

export interface CommentThreadSummary {
  count: number;
  // Up to the 3 most recent comments, oldest-to-newest among themselves (a straight tail
  // slice of the full ascending-ordered list) — PIC-33's default collapsed view.
  recent: Comment[];
}

const PREVIEW_SIZE = 3;

type RawCommentRow = {
  id: string;
  author_roster_id: string;
  body: string;
  created_at: string;
};

// Shared by getCommentThreadSummary and getFullThread — resolves author display names in
// one batched roster query (mirrors getReactors' two-query style in reactions-actions.ts
// rather than a PostgREST embedded join, since no embedded-join usage is established
// elsewhere in this codebase) and stamps each row with isOwn against the current viewer.
async function resolveComments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: RawCommentRow[],
  currentRosterId: string,
): Promise<Comment[]> {
  if (rows.length === 0) return [];

  const rosterIds = [...new Set(rows.map((r) => r.author_roster_id))];
  const { data: roster, error } = await supabase
    .from("roster")
    .select("id, display_name")
    .in("id", rosterIds);
  if (error) throw new Error(`Couldn't load comment authors: ${error.message}`);

  const nameById = new Map((roster ?? []).map((r) => [r.id, r.display_name ?? "Unknown"]));

  return rows.map((r) => ({
    id: r.id,
    authorName: nameById.get(r.author_roster_id) ?? "Unknown",
    body: r.body,
    createdAt: r.created_at,
    isOwn: r.author_roster_id === currentRosterId,
  }));
}

// PIC-33/NF4-NF6: fetched per-post, independently of the feed's own load and of every
// other post's comment thread (Design System's Epic 4 section: the comment list has its
// own loading/error treatment scoped to the thread zone, distinct from the feed's and not
// blocking the post card or composer) — called by CommentThread on mount, not batched by
// app/feed/page.tsx the way reactions are. A slow or failed comment fetch on one post never
// gates any other post or the feed itself.
export async function getCommentThreadSummary(postId: string): Promise<CommentThreadSummary> {
  const supabase = await createClient();
  const { id: currentRosterId } = await getCurrentRoster(supabase);

  // E4 finding: this used to fetch every row for the post (no .limit) just to discard all
  // but the last 3 client-side — cost scaled with total comment count, not PREVIEW_SIZE, on
  // a post that could accumulate hundreds of comments over a season. The composite
  // (post_id, created_at) index was created specifically to support this tail-3 query
  // efficiently: fetch descending + limit, then reverse back to ascending for display.
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("comments")
      .select("id, author_roster_id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(PREVIEW_SIZE),
    supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
  ]);
  if (error) throw new Error(`Couldn't load comments: ${error.message}`);
  if (countError) throw new Error(`Couldn't load comment count: ${countError.message}`);

  const rows = (data ?? []).slice().reverse();
  const resolved = await resolveComments(supabase, rows, currentRosterId);

  return { count: count ?? 0, recent: resolved };
}

// PIC-33 (P1 edge case — "See all N comments"): the full ascending-ordered thread, fetched
// only when a viewer actually expands it — mirrors getReactors' on-demand-only-when-opened
// scoping in reactions-actions.ts.
export async function getFullThread(postId: string): Promise<Comment[]> {
  const supabase = await createClient();
  const { id: currentRosterId } = await getCurrentRoster(supabase);

  const { data, error } = await supabase
    .from("comments")
    .select("id, author_roster_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Couldn't load comments: ${error.message}`);

  return resolveComments(supabase, data ?? [], currentRosterId);
}

// NF4: posts as the current viewer. Returns the resolved Comment immediately (author name
// included) so the caller can append it to its list without a second fetch.
export async function addComment(postId: string, body: string): Promise<Comment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment can't be empty.");

  const supabase = await createClient();
  const { id: rosterId, displayName } = await getCurrentRoster(supabase);

  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_roster_id: rosterId, body: trimmed })
    .select("id, created_at")
    .single();
  if (error || !data) throw new Error(`Couldn't post your comment: ${error?.message ?? "unknown error"}`);

  revalidatePath("/feed");
  return { id: data.id, authorName: displayName, body: trimmed, createdAt: data.created_at, isOwn: true };
}

// NF5/NF6: deletes by comment id — no role check duplicated here on purpose. RLS
// (comments_delete_own_or_commissioner) is the actual enforcement; if it denies, the delete
// affects zero rows and Supabase reports no error, so the caller-side UI is what's
// responsible for only showing this affordance to the comment's author or a commissioner in
// the first place (same division of responsibility as deleteReaction in
// reactions-actions.ts).
export async function deleteComment(commentId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(`Couldn't remove that comment: ${error.message}`);
  revalidatePath("/feed");
}
