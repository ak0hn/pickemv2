"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadPostImage } from "@/lib/posts/actions";
import { PostBlockContent } from "@/components/feed/PostBlockContent";
import type { PostBlockData, PostTrigger } from "@/lib/posts/types";

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
          {block && <PostBlockContent block={block} context="preview" />}

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
