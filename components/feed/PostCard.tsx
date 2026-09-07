import Link from "next/link";
import Image from "next/image";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostBlockContent } from "@/components/feed/PostBlockContent";
import { formatRelativeTime } from "@/lib/feed/format";
import type { FeedPost } from "@/lib/posts/actions";

// PIC-31/NF10: the feed post card. Zone order per the Design System's Epic 4 section:
// author/timestamp -> message -> image (freeform only) -> structured block -> CTA row.
// Reactions and comments (PIC-32/PIC-33, separate tickets) mount directly below the CTA
// row once built — no placeholder rendered for them here, same "positionally reserved,
// not visually reserved" pattern as Epic 1's CT8-CT10 tiebreaker slot.
export function PostCard({ post }: { post: FeedPost }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <p className="text-sm font-medium text-card-foreground">
          {post.authorName} <span className="text-xs text-muted-foreground">· Commissioner</span>
        </p>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(post.created_at)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {post.message && <p className="text-sm text-card-foreground">{post.message}</p>}

        {post.trigger === "freeform" && post.image_url && (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg">
            <Image
              src={post.image_url}
              alt=""
              fill
              className="max-h-64 rounded-lg object-cover"
            />
          </div>
        )}

        {post.block_data && <PostBlockContent block={post.block_data} context="feed" />}

        <PostCardCta post={post} />
      </CardContent>
    </Card>
  );
}

// NF11-14: CTA is trigger-dependent. open_tiebreaker renders no CTA yet — Epic 3 inserts
// an eligibility-conditional one here without a rendering-layer rewrite (NF14). freeform
// has no CTA (NF13). Any post whose block_data doesn't match its trigger's expected shape
// (a data anomaly, not an expected state) also renders no CTA rather than crashing.
function PostCardCta({ post }: { post: FeedPost }) {
  if (post.trigger === "open_week") {
    // No block_data guard needed here (unlike close_week below) — this branch never reads
    // block_data, it's a static CTA.
    return (
      <Button variant="secondary" className="w-full" asChild>
        <Link href="/picks">Make your picks</Link>
      </Button>
    );
  }

  if (post.trigger === "close_week" && post.block_data?.type === "close_week") {
    const weekNumber = post.block_data.weekNumber;
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/picks?week=${weekNumber}`}>View my results</Link>
        </Button>
        <Button variant="outline" className="w-full" asChild>
          <Link href="/league">View league results</Link>
        </Button>
      </div>
    );
  }

  return null;
}
