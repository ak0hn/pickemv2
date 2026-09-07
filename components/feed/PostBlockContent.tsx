import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PostBlockData, BlockGameRow } from "@/lib/posts/types";

// PIC-31: extracted from components/composer/PostComposer.tsx, which previously owned
// this rendering as its own pre-post preview only. Both the composer preview and the
// public feed (PIC-31) now consume this single implementation rather than two drifting
// copies of the same block_data -> UI mapping.
//
// `context` distinguishes the two call sites per the Design System's Epic 4 section:
// - "preview": composer's own bg-card surface (the sheet itself sits on
//   --surface-elevated, so a nested block uses --card to stay one level down) — and the
//   close_week block's internal "(see full)" link DOES render (a reasonable aid while the
//   commish is still drafting the post).
// - "feed": the post card is already at --card, so the block must sit at
//   --surface-elevated instead (bg-card nested in bg-card would be invisible — the same
//   token-collision class as an earlier Epic 1 bug) — and the "(see full)" link is
//   suppressed, since NF12's "View league results" CTA is the feed's sole route to
//   /league (Product's resolution, Sep 7, 2026 design pass).
export type PostBlockContext = "preview" | "feed";

// Design System's own two examples ("Home -6.5" or "Away +6.5") don't fully pin down a
// rule for every case — this codebase stores `spread` as the home team's line (negative
// = home favored), and SlateBuilder already displays it that way (home abbr + signed
// value), so this block mirrors that same convention for consistency rather than
// inventing a second display rule. A spread of exactly 0 is a pick'em — shown as "PK" per
// sports convention rather than a bare, sign-less "0".
function formatSpreadLine(row: BlockGameRow): string {
  if (row.spread === null) return `${row.away} @ ${row.home}`;
  if (row.spread === 0) return `${row.away} @ ${row.home} — PK`;
  const sign = row.spread > 0 ? "+" : "";
  return `${row.away} @ ${row.home} — ${row.home} ${sign}${row.spread}`;
}

export function PostBlockContent({
  block,
  context,
}: {
  block: PostBlockData;
  context: PostBlockContext;
}) {
  const surfaceClass = context === "feed" ? "bg-surface-elevated" : "bg-card";

  if (block.type === "open_week") {
    return (
      <div className={`flex flex-col gap-2 rounded-lg border border-border p-3 ${surfaceClass}`}>
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
      <div className={`flex flex-col gap-2 rounded-lg border border-border p-3 ${surfaceClass}`}>
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
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            This week&apos;s winner{block.weeklyWinners?.length === 1 ? "" : "s"}
          </p>
          {/* Sep 7, 2026 (Alex's live PIC-31 feedback): replaces the old season-standings
              snippet (full win/loss/push for up to 5 GMs — "way too much info/data" for a
              feed card) with a name-pill list of just this week's 6/6 winners. Full
              standings still live on the League page (the CTA below, or NF12 on the feed
              card itself). weeklyWinners is optional — older stored posts predate this
              field and simply render no pills rather than crashing. */}
          {block.weeklyWinners && block.weeklyWinners.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {block.weeklyWinners.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No 6/6 winners this week.</p>
          )}
          {context === "preview" && (
            <Link href="/league" className="mt-1.5 inline-block text-xs text-muted-foreground underline">
              (see full)
            </Link>
          )}
        </div>
      </div>
    );
  }

  // open_tiebreaker — not reachable before Epic 3 ships; rendered as-is, no CTA (NF14
  // reserves the slot below this block for Epic 3's eligibility-conditional control).
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-border p-3 ${surfaceClass}`}>
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
