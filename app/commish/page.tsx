"use client";

import { useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WeekControlTile } from "@/components/commish/WeekControlTile";
import { PickTracker } from "@/components/commish/PickTracker";
import { PostComposer } from "@/components/composer/PostComposer";
import { createFreeformPost } from "@/lib/posts/actions";

// Aug 31, 2026 (Alex's live spot-check, third pass on PIC-24/PR #7): SlateBuilder,
// ResultsStandingsPreview, and WeekCloseControl collapsed into one WeekControlTile — two
// tiles both claiming to represent "Week 1" was the actual bug. See WeekControlTile.tsx
// for the four-state model (draft / published / complete / closed).
export default function CommishPage() {
  const { persona } = useDev();
  const [composerOpen, setComposerOpen] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg text-foreground">Commish Tools</h1>

      <WeekControlTile />

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

      <Separator />

      <PickTracker />
    </div>
  );
}
