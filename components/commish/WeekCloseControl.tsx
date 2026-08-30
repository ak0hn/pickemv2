"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCloseableWeekAction } from "@/lib/slate/actions";
import { buildCloseWeekBlock, closeWeekWithPost } from "@/lib/posts/actions";
import type { CloseWeekBlock } from "@/lib/posts/types";
import { PostComposer } from "@/components/composer/PostComposer";

type LoadState = "loading" | "loaded" | "empty" | "error";

// CT18: closing the week is coupled to the results announcement post — same pattern as
// SlateBuilder's "Publish week", per the e2e illustration doc (real manual process treats
// closing + announcing results as one commish action, not two). Kept as its own component
// rather than folded into SlateBuilder since it's a distinct lifecycle action, not slate
// editing — mirrors the separate "Monday Night Tiebreaker" card already on this page.
export function WeekCloseControl() {
  const [week, setWeek] = useState<{ id: string; state: string } | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buildingBlock, setBuildingBlock] = useState(false);
  const [closeWeekBlock, setCloseWeekBlock] = useState<CloseWeekBlock | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getCloseableWeekAction();
      if (!data) {
        setState("empty");
        return;
      }
      setWeek(data);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleOpenComposer() {
    if (!week) return;
    setErrorMessage(null);
    setBuildingBlock(true);
    try {
      const block = await buildCloseWeekBlock(week.id);
      setCloseWeekBlock(block);
      setComposerOpen(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't prepare the results post.");
    } finally {
      setBuildingBlock(false);
    }
  }

  async function handleConfirmCloseWeekPost(message: string, imageUrl: string | null) {
    if (!week || !closeWeekBlock) return;
    const result = await closeWeekWithPost({ weekId: week.id, message, block: closeWeekBlock, imageUrl });
    if (!result.ok) {
      // Thrown here (client code, not "use server") so PostComposer's existing catch
      // displays the real message instead of Next's production redaction — same fix as
      // PIC-11's publish path.
      throw new Error(result.error);
    }
    await load();
  }

  if (state === "loading") return null;

  if (state === "error") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive" role="alert">
            Couldn&apos;t load week status. Check your connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No week published yet, or nothing to close (draft state) — nothing to render. Not an
  // error state, just not applicable yet.
  if (state === "empty" || !week || week.state === "draft") return null;

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">Close Week</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {week.state === "closed" ? (
          <p className="text-sm text-muted-foreground">Week closed — results posted.</p>
        ) : (
          <Button size="sm" className="self-start" onClick={handleOpenComposer} disabled={buildingBlock}>
            {buildingBlock ? "Preparing…" : "Close Week"}
          </Button>
        )}
        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
      </CardContent>

      <PostComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        trigger="close_week"
        block={closeWeekBlock}
        onConfirm={handleConfirmCloseWeekPost}
      />
    </Card>
  );
}
