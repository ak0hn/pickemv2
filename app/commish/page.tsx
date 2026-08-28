"use client";

import { useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import { getWeekPhase } from "@/lib/mock/data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SlateBuilder } from "@/components/commish/SlateBuilder";
import { PostComposer } from "@/components/composer/PostComposer";
import { createFreeformPost } from "@/lib/posts/actions";

export default function CommishPage() {
  const { now, persona, tiebreakerInvoked, setTiebreakerInvoked } = useDev();
  const [weekOffset] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const phase = getWeekPhase(weekOffset, now, tiebreakerInvoked);

  async function handleFreeformPost(message: string, imageUrl: string | null) {
    await createFreeformPost({ message, imageUrl });
  }

  if (persona.role !== "commissioner") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Commish Tools isn&apos;t visible to this persona. Switch to a commissioner
          account in the dev bar below to view it.
        </p>
      </div>
    );
  }

  const readyForTiebreaker = phase === "awaiting-tiebreaker" || phase === "tiebreaker-open";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg text-foreground">Commish Tools</h1>

      <SlateBuilder />

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Post to Feed</p>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={() => setComposerOpen(true)}>
            New post
          </Button>
        </CardContent>
      </Card>

      <PostComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        trigger="freeform"
        block={null}
        onConfirm={handleFreeformPost}
      />

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Monday Night Tiebreaker</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Invoke tiebreaker for this week</p>
              <p className="text-xs text-muted-foreground">
                {readyForTiebreaker
                  ? "Sunday's games are final — you can open this now."
                  : "Available once Sunday's games are final."}
              </p>
            </div>
            <Switch
              checked={tiebreakerInvoked}
              disabled={!readyForTiebreaker}
              onCheckedChange={setTiebreakerInvoked}
            />
          </div>
          {!tiebreakerInvoked && phase === "week-complete" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Not invoked this week — all 6/6 GMs stay co-winners.
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Pick tracker &amp; exceptions</p>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Placeholder — per-GM submission status and manual override entry point
            (Epic 1 build).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
