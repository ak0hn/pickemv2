"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { useDev } from "@/lib/dev/DevProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { WeekControlTile } from "@/components/commish/WeekControlTile";
import { PickTracker } from "@/components/commish/PickTracker";
import { createFreeformPost, uploadPostImage } from "@/lib/posts/actions";

// Aug 31, 2026 (Alex's live spot-check, third pass on PIC-24/PR #7): SlateBuilder,
// ResultsStandingsPreview, and WeekCloseControl collapsed into one WeekControlTile — two
// tiles both claiming to represent "Week 1" was the actual bug. See WeekControlTile.tsx
// for the four-state model (draft / published / complete / closed).
//
// Sep 6/7, 2026 (Alex's live Epic 1 E2E feedback): the evergreen "Post to Feed" card used
// to open a bottom-sheet composer, while the tile's own open/close-week posting is an
// inline text box — inconsistent. Rebuilt inline here to match.
//
// Sep 7, 2026 correction: the initial "once live, post card always wins" reorder was too
// blunt — the tile itself hosts the Open Week and Close Week actions, and "opening +
// closing week is higher priority than generally posting" (Alex's own words) means the
// TILE should be on top whenever it has one of those pending, not just in draft. Only the
// mid-week "published, nothing tile-actionable yet" window is when the post card should
// lead. WeekControlTile computes this and notifies via onTilePriorityChange; each card
// renders inside a stably-keyed element so React reconciles the swap by key instead of
// remounting either component.
export default function CommishPage() {
  const { persona } = useDev();
  const [tileHasPriority, setTileHasPriority] = useState(true);

  const [postMessage, setPostMessage] = useState("");
  const [postImageUrl, setPostImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setPostError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = await uploadPostImage(formData);
      setPostImageUrl(url);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't upload the image.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePost() {
    if (postMessage.trim() === "") return;
    setPosting(true);
    setPostError(null);
    try {
      await createFreeformPost({ message: postMessage, imageUrl: postImageUrl });
      setPostMessage("");
      setPostImageUrl(null);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't post.");
    } finally {
      setPosting(false);
    }
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

  const weekTile = <WeekControlTile onTilePriorityChange={setTileHasPriority} />;

  const postCard = (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">Post to Feed</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Label htmlFor="freeform-message">Message</Label>
        <Textarea
          id="freeform-message"
          placeholder="Write a post…"
          value={postMessage}
          onChange={(e) => setPostMessage(e.target.value)}
        />
        <div className="flex items-center gap-2">
          {postImageUrl ? (
            <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
              <Image src={postImageUrl} alt="" fill className="object-cover" />
              <button
                type="button"
                onClick={() => setPostImageUrl(null)}
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
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground disabled:opacity-50"
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
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={handlePost}
          disabled={posting || uploading || postMessage.trim() === ""}
        >
          {posting ? "Posting…" : "Post"}
        </Button>
        {postError && (
          <p className="text-sm text-destructive" role="alert">
            {postError}
          </p>
        )}
      </CardContent>
    </Card>
  );

  const orderedCards = tileHasPriority
    ? [
        <div key="week-tile">{weekTile}</div>,
        <div key="post-card">{postCard}</div>,
      ]
    : [
        <div key="post-card">{postCard}</div>,
        <div key="week-tile">{weekTile}</div>,
      ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg text-foreground">Commish Tools</h1>

      {orderedCards}

      <Separator />

      <PickTracker />
    </div>
  );
}
