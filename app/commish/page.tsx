"use client";

import { useState } from "react";
import { useDev } from "@/lib/dev/DevProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SlateBuilder } from "@/components/commish/SlateBuilder";
import { ResultsStandingsPreview } from "@/components/commish/ResultsStandingsPreview";
import { PickTracker } from "@/components/commish/PickTracker";
import { PostComposer } from "@/components/composer/PostComposer";
import { createFreeformPost } from "@/lib/posts/actions";

// Aug 31, 2026 (Alex's live spot-check on PR #7): the Monday Night Tiebreaker toggle and
// Close Week now render inside ResultsStandingsPreview itself, not as separate cards here
// — "that's the object you're closing." ResultsStandingsPreview also moved up, directly
// after SlateBuilder, so once a week's games are done, results are the prominent view
// instead of sitting further down the page.
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

      <SlateBuilder />

      <ResultsStandingsPreview />

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
