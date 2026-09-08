"use client";

import { useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getReactors, deleteReaction, type Reactor } from "@/lib/feed/reactions-actions";

// PIC-32/NF3: single "like" reaction, count-only primary display (no persistent name
// list — unmanageable at up to 101 GMs). Per the Design System's Epic 4 section:
// - not reacted, zero: outline heart only, no count
// - not reacted, N >= 1: outline heart + count
// - reacted by viewer: filled --destructive red heart + count
// The heart icon toggles the viewer's own reaction (its own 44x44 hit target); the count,
// when present, is a separate tap target opening the "who reacted" sheet (design spec's
// own optional suggestion — no longer optional once NF6 needs a way to identify an
// individual reaction to moderate, see ReactorsSheet below).
export function ReactionControl({
  postId,
  count,
  viewerReacted,
  onToggle,
  disabled,
  isCommissioner,
}: {
  postId: string;
  count: number;
  viewerReacted: boolean;
  onToggle: () => void;
  disabled?: boolean;
  isCommissioner: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={viewerReacted}
        aria-label={viewerReacted ? "Remove your like" : "Like this post"}
        className="flex min-h-11 min-w-11 items-center justify-center disabled:opacity-60"
      >
        <Heart
          className={viewerReacted ? "h-5 w-5 fill-destructive text-destructive" : "h-5 w-5 text-muted-foreground"}
        />
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`See who liked this post (${count})`}
          className="flex min-h-11 min-w-11 items-center px-1"
        >
          <span className={viewerReacted ? "text-sm text-card-foreground" : "text-sm text-muted-foreground"}>
            {count}
          </span>
        </button>
      )}
      {sheetOpen && (
        <ReactorsSheet
          postId={postId}
          isCommissioner={isCommissioner}
          onOpenChange={setSheetOpen}
        />
      )}
    </div>
  );
}

// PIC-32/NF6: fetched on demand (only when a viewer actually opens this sheet for one
// specific post), not eagerly for every post on the feed — see getReactors' own comment
// for why that scoping matters at 101-GM scale. Commissioner-only delete affordance per
// reactor row; a GM viewer sees the same list with no delete button at all (their own
// reaction is already removable via the heart toggle itself, not from here).
function ReactorsSheet({
  postId,
  isCommissioner,
  onOpenChange,
}: {
  postId: string;
  isCommissioner: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reactors, setReactors] = useState<Reactor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    getReactors(postId)
      .then(setReactors)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load who reacted."));
  }, [postId]);

  async function handleRemove(rosterId: string) {
    setRemovingId(rosterId);
    setError(null);
    try {
      await deleteReaction(postId, rosterId);
      setReactors((prev) => (prev ? prev.filter((r) => r.rosterId !== rosterId) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that reaction.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl border-border bg-surface-elevated p-4">
        <SheetHeader>
          <SheetTitle>Liked by</SheetTitle>
        </SheetHeader>
        <div className="mt-3 flex flex-col gap-1">
          {reactors === null && !error && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {reactors?.map((r) => (
            <div key={r.rosterId} className="flex min-h-11 items-center justify-between text-sm">
              <span>{r.name}</span>
              {isCommissioner && (
                <button
                  type="button"
                  onClick={() => handleRemove(r.rosterId)}
                  disabled={removingId === r.rosterId}
                  aria-label={`Remove ${r.name}'s like`}
                  className="flex h-11 w-11 items-center justify-center text-muted-foreground disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {reactors?.length === 0 && (
            <p className="text-sm text-muted-foreground">No one has liked this post.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
