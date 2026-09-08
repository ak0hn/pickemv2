"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDev } from "@/lib/dev/DevProvider";
import { formatRelativeTime } from "@/lib/feed/format";
import {
  getCommentThreadSummary,
  getFullThread,
  addComment,
  deleteComment,
  type Comment,
} from "@/lib/feed/comments-actions";

// PIC-33/NF4-NF6: comment list above the composer, both below the post card's second
// Separator (PIC-32's reaction control sits above the first one — see PostCard.tsx's zone
// order comment). Fetches its own thread on mount, independently of the feed's own load and
// of every other post's thread — Design System's Epic 4 section scopes the comment list's
// loading/error treatment to this zone specifically, not blocking the card or composer.
export function CommentThread({ postId, isCommissioner }: { postId: string; isCommissioner: boolean }) {
  // Sep 7, 2026: same staleness class PIC-32's reactions hit — isOwn (and therefore the
  // delete affordance) is computed against whichever roster was signed in at the last
  // fetch. Without clockTick here, switching dev personas would keep showing a comment as
  // "yours" (or not) for the *previous* signed-in identity until postId happened to change.
  const { clockTick } = useDev();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Design System's Epic 4 section locks the exact copy for this state ("Couldn't load
  // comments." + Retry) — unlike the delete/submit error states below, which show the
  // caught error's own message (no locked copy given for those) — so this only needs to
  // track whether an error occurred, not its text.
  const [hasLoadError, setHasLoadError] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  // A Set, not a single id — mirrors app/feed/page.tsx's pendingReactionIds (an earlier E4
  // finding on PIC-32: a single-slot guard silently re-enables an unrelated in-flight delete
  // when two rows are deleted close together, since the slot gets overwritten then cleared by
  // whichever request's `finally` fires, not necessarily the one it was tracking).
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  // E4 finding: submit() guarded on the `posting` state value read at call time, which React
  // may not have committed yet between two rapid Enter keydowns (both read posting=false and
  // both call addComment) — a ref is checked/set synchronously, closing that race. `posting`
  // state is kept purely for the UI (disabled input/button), not as the actual lock.
  const submittingRef = useRef(false);
  // E4 finding: an expand failure fell back to a Retry that called load() (the summary
  // fetch), not the expand itself — the user taps Retry after "couldn't load comments" and
  // silently lands back on the 3-comment preview with no indication the expand failed.
  const [expandError, setExpandError] = useState(false);

  function load() {
    setHasLoadError(false);
    // E4 verification finding: expandError wasn't reset here, so a failed expand followed by
    // a clockTick-triggered reload (e.g. a persona switch) left "Couldn't load the full
    // thread" showing over a thread that was never re-expanded in this load cycle.
    setExpandError(false);
    // Reset to the skeleton state during a reload (e.g. Retry, or a persona-switch refetch)
    // rather than leaving the previous fetch's comments — including their isOwn, stamped
    // against whoever was signed in before — visible and interactive during the refetch.
    setComments(null);
    getCommentThreadSummary(postId)
      .then((summary) => {
        setComments(summary.recent);
        setTotalCount(summary.count);
        setExpanded(false);
      })
      .catch(() => setHasLoadError(true));
  }

  useEffect(load, [postId, clockTick]);

  async function handleExpand() {
    setExpandError(false);
    try {
      const full = await getFullThread(postId);
      setComments(full);
      setExpanded(true);
    } catch {
      setExpandError(true);
    }
  }

  async function submit() {
    if (!composerValue.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setPosting(true);
    setPostError(null);
    try {
      const comment = await addComment(postId, composerValue);
      setComments((prev) => (prev ? [...prev, comment] : [comment]));
      setTotalCount((prev) => prev + 1);
      setComposerValue("");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't post your comment.");
    } finally {
      submittingRef.current = false;
      setPosting(false);
    }
  }

  async function handleDelete(commentId: string) {
    setDeletingIds((prev) => new Set(prev).add(commentId));
    setDeleteErrors((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
    try {
      await deleteComment(commentId);
      setComments((prev) => (prev ? prev.filter((c) => c.id !== commentId) : prev));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setDeleteErrors((prev) => ({
        ...prev,
        [commentId]: err instanceof Error ? err.message : "Couldn't remove that comment.",
      }));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {comments === null && !hasLoadError && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-full" />
        </div>
      )}

      {hasLoadError && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load comments.{" "}
          <button type="button" onClick={load} className="underline">
            Retry
          </button>
        </p>
      )}

      {comments !== null && (
        <div className="flex flex-col gap-3">
          {!expanded && totalCount > comments.length && (
            <button
              type="button"
              onClick={handleExpand}
              className="text-left text-sm text-muted-foreground underline"
            >
              See all {totalCount} comments
            </button>
          )}

          {expandError && (
            <p className="text-sm text-destructive">
              Couldn&apos;t load the full thread.{" "}
              <button type="button" onClick={handleExpand} className="underline">
                Retry
              </button>
            </p>
          )}

          {comments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-card-foreground">
                  {comment.authorName}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {formatRelativeTime(comment.createdAt)}
                  </span>
                </p>
                {(comment.isOwn || isCommissioner) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    disabled={deletingIds.has(comment.id)}
                    aria-label={`Delete comment by ${comment.authorName}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-card-foreground">{comment.body}</p>
              {deleteErrors[comment.id] && (
                <p className="text-sm text-destructive">
                  {deleteErrors[comment.id]}{" "}
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="underline"
                  >
                    Try again
                  </button>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            value={composerValue}
            onChange={(e) => setComposerValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Add a comment…"
            disabled={posting}
            aria-label="Add a comment"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={submit}
            disabled={posting || !composerValue.trim()}
          >
            Post
          </Button>
        </div>
        {postError && (
          <p className="text-sm text-destructive">
            {postError}{" "}
            <button type="button" onClick={submit} className="underline">
              Try again
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
