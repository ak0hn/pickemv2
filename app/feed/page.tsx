"use client";

import { useCallback, useEffect, useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/feed/PostCard";
import { getFeedPosts, type FeedPost } from "@/lib/posts/actions";

// PIC-31: hardens the Aug 2, 2026 walking-skeleton scaffold (mock posts, a week
// selector) against real data. The week selector is gone — NF7-NF9 retired the
// past/future sub-navigation this page used to have in favor of a single rolling feed
// (Sep 7, 2026 PRD decision); a feed doesn't need week-scoped pagination the way a
// transactional page does, you just scroll.
type LoadState = "loading" | "loaded" | "empty" | "error";

export default function FeedPage() {
  const { persona } = useDev();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await getFeedPosts();
      setPosts(data);
      setState(data.length === 0 ? "empty" : "loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
