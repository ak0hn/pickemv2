"use client";

import { useCallback, useEffect, useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/feed/PostCard";
import { getFeedPosts, type FeedPost } from "@/lib/posts/actions";
import { getReactionSummaries, toggleReaction, type ReactionSummary } from "@/lib/feed/reactions-actions";

// PIC-31: hardens the Aug 2, 2026 walking-skeleton scaffold (mock posts, a week
// selector) against real data. The week selector is gone — NF7-NF9 retired the
// past/future sub-navigation this page used to have in favor of a single rolling feed
// (Sep 7, 2026 PRD decision); a feed doesn't need week-scoped pagination the way a
// transactional page does, you just scroll.
type LoadState = "loading" | "loaded" | "empty" | "error";

export default function FeedPage() {
  const { persona, clockTick } = useDev();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reactions, setReactions] = useState<Record<string, ReactionSummary>>({});
  // Sep 7, 2026 (E4 finding on PIC-32): was a single global `pendingReactionId` guard that
  // silently dropped taps on any OTHER post while one reaction toggle was in flight — the
  // per-post disabled state only looked right, the guard blocked everything. A Set makes
  // "which posts have an in-flight toggle" precise instead of global.
  const [pendingReactionIds, setPendingReactionIds] = useState<Set<string>>(new Set());
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    let data: FeedPost[];
    try {
      data = await getFeedPosts();
      setPosts(data);
      setState(data.length === 0 ? "empty" : "loaded");
    } catch {
      setState("error");
      return;
    }
    // Sep 7, 2026 (E4 finding on PIC-32): was inside the same try/catch as getFeedPosts —
    // a reactions-service blip poisoned the whole feed's load state even though posts had
    // already loaded fine. Isolated so a reactions failure degrades to empty summaries
    // (no counts shown) instead of hiding the entire feed behind an error card.
    try {
      setReactions(await getReactionSummaries(data.map((p) => p.id)));
    } catch {
      setReactions({});
    }
  }, []);

  useEffect(() => {
    load();
    // Sep 7, 2026 (Alex's live PIC-32 QA): clockTick also bumps on a dev persona switch
    // (DevProvider), not just a clock change — the feed's reaction summaries are scoped to
    // whichever GM/commissioner is actually signed in, and switching "Viewing as" swaps that
    // real session underneath. Without this, a post's like state kept reflecting whoever was
    // signed in at the last fetch, and tapping the heart toggled THEIR reaction, not the
    // currently-viewed persona's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, clockTick]);

  // Optimistic — flips local state immediately, calls the server action in the background,
  // reverts on failure. A full refetch per tap would feel laggy for something this frequent.
  const handleToggleReaction = useCallback(
    async (postId: string) => {
      if (pendingReactionIds.has(postId)) return;
      const previous = reactions[postId] ?? { count: 0, viewerReacted: false };
      const optimistic: ReactionSummary = previous.viewerReacted
        ? { count: previous.count - 1, viewerReacted: false }
        : { count: previous.count + 1, viewerReacted: true };
      setReactions((prev) => ({ ...prev, [postId]: optimistic }));
      setPendingReactionIds((prev) => new Set(prev).add(postId));
      try {
        // Sep 7, 2026 (E4 finding on PIC-32): the server's returned `reacted` value used to
        // be discarded — on a multi-device conflict (the same GM reacting from two
        // sessions), the client's optimistic guess could permanently diverge from what the
        // server actually did. Reconciling here closes that window without a full refetch.
        const { reacted } = await toggleReaction(postId);
        setReactions((prev) => ({
          ...prev,
          [postId]: { ...(prev[postId] ?? optimistic), viewerReacted: reacted },
        }));
      } catch {
        setReactions((prev) => ({ ...prev, [postId]: previous }));
      } finally {
        setPendingReactionIds((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      }
    },
    [pendingReactionIds, reactions],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg text-foreground">Feed</h1>

      {state === "loading" && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {state === "empty" && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="font-display text-xl text-foreground">Nothing here yet.</p>
          <p className="text-sm text-muted-foreground">
            {persona.role === "commissioner"
              ? "Post to your league to get started. Open a week from Commish Tools."
              : "The commissioner will post when the week opens — check back soon."}
          </p>
        </div>
      )}

      {state === "error" && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col items-start gap-2 pt-6">
            <p className="text-sm text-destructive">
              Couldn&apos;t load the feed. Check your connection and try again.
            </p>
            <Button size="sm" variant="secondary" onClick={() => load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {state === "loaded" && (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              reaction={reactions[post.id] ?? { count: 0, viewerReacted: false }}
              onToggleReaction={() => handleToggleReaction(post.id)}
              reactionPending={pendingReactionIds.has(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
