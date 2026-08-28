"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadPostImage } from "@/lib/posts/actions";
import type { PostBlockData, PostTrigger, BlockGameRow } from "@/lib/posts/types";

// close_week's placeholder needs the real week number, which only the block (not the
// trigger alone) carries — so this is a function keyed on both, not a static lookup.
function getPlaceholder(trigger: PostTrigger, block: PostBlockData | null): string {
  switch (trigger) {
    case "open_week":
      return "Add a message to this week's slate…";
    case "close_week":
      return `Add a message to close out Week ${block?.type === "close_week" ? block.weekNumber : "[N]"}…`;
    case "open_tiebreaker":
      return "Add a message to open the tiebreaker…";
    case "freeform":
      return "Write a post…";
  }
}

// Design System's own two examples ("Home -6.5" or "Away +6.5") don't fully pin down a
// rule for every case — this codebase stores `spread` as the home team's line (negative
// = home favored), and SlateBuilder already displays it that way (home abbr + signed
// value), so the composer's block mirrors that same convention for consistency rather
// than inventing a second display rule. A spread of exactly 0 is a pick'em — shown as
// "PK" per sports convention rather than a bare, sign-less "0".
function formatSpreadLine(row: BlockGameRow): string {
  if (row.spread === null) return `${row.away} @ ${row.home}`;
  if (row.spread === 0) return `${row.away} @ ${row.home} — PK`;
  const sign = row.spread > 0 ? "+" : "";
  return `${row.away} @ ${row.home} — ${row.home} ${sign}${row.spread}`;
}

function BlockContent({ block }: { block: PostBlockData }) {
  if (block.type === "open_week") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium">Week {block.weekNumber} Slate</p>
        <div className="flex flex-col gap-1.5">
          {block.games.map((g, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span>{formatSpreadLine(g)}</span>
              <span className="text-muted-foreground">{g.kickoffLabel}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "close_week") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium">Week {block.weekNumber} Results</p>
        <div className="flex flex-col gap-1.5">
          {block.games.map((g, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span>
                <span className={g.winner === "away" ? "font-semibold" : undefined}>{g.away}</span>
                {" @ "}
                <span className={g.winner === "home" ? "font-semibold" : undefined}>{g.home}</span>
              </span>
              <span className="text-muted-foreground">{g.winner === "push" ? "Push" : ""}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground">Standings update</p>
          {block.standings.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span>{s.name}</span>
              <span className="text-muted-foreground">
                {s.wins}-{s.losses}-{s.pushes}
              </span>
            </div>
          ))}
          <Link href="/league" className="mt-1 inline-block text-xs text-muted-foreground underline">
            (see full)
          </Link>
        </div>
      </div>
    );
  }

  // open_tiebreaker
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium">Tiebreaker: Monday Night Football</p>
      <div className="flex items-center justify-between text-xs">
        <span>{formatSpreadLine(block.game)}</span>
        <span className="text-muted-foreground">{block.game.kickoffLabel}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Pick the winner against the spread — closes at kickoff.
      </p>
    </div>
  );
}

interface PostComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: PostTrigger;
  block: PostBlockData | null;
  /** Called with the final message + uploaded image URL once the commish confirms. */
  onConfirm: (message: string, imageUrl: string | null) => Promise<void>;
}

export function PostComposer({ open, onOpenChange, trigger, block, onConfirm }: PostComposerProps) {
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMessage("");
    setImageUrl(null);
    setError(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await uploadPostImage(formData);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the image.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePost() {
    setPosting(true);
    setError(null);
    try {
      await onConfirm(message, imageUrl);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post.");
    } finally {
      setPosting(false);
    }
  }

  function handleCancel() {
    // Nothing has been written yet — the triggering action (e.g. Open Week's publish)
    // only runs inside onConfirm, so canceling here means it genuinely never happened.
    reset();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(next) : handleCancel())}>
      <SheetContent
        side="bottom"
        className="flex h-[70vh] flex-col gap-4 rounded-t-xl border-border bg-surface-elevated p-4"
      >
        <SheetHeader>
          <SheetTitle>
            {trigger === "freeform" ? "New post" : "Post to Feed"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <Textarea
            autoFocus
            rows={3}
            placeholder={getPlaceholder(trigger, block)}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[4.5rem] max-h-48 resize-none text-base"
          />

          <div className="flex items-center gap-2">
            {imageUrl ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
                <Image src={imageUrl} alt="" fill className="object-cover" />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/60 text-white"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground disabled:opacity-50"
                aria-label="Attach photo"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
          </div>

          {/* Read-only, non-removable per CT17 — the block is what ties this post to the
              action that triggered it; letting it be edited or detached would break that
              coupling. */}
          {block && <BlockContent block={block} />}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className={cn("flex flex-col gap-2 border-t border-border pt-3")}>
          <Button className="w-full" onClick={handlePost} disabled={posting || uploading}>
            {posting ? "Posting…" : "Post"}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
