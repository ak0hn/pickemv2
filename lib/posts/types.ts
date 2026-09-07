export type PostTrigger = "open_week" | "close_week" | "open_tiebreaker" | "freeform";

// One row per game in the Open Week / Close Week / Open Tiebreaker structured block.
// Kickoff label is pre-formatted at block-build time (e.g. "Thu 8:20 PM ET") — the
// composer only renders strings, it doesn't own date/timezone formatting logic.
export interface BlockGameRow {
  away: string;
  home: string;
  spread: number | null;
  kickoffLabel: string;
}

export interface OpenWeekBlock {
  type: "open_week";
  weekNumber: number;
  games: BlockGameRow[];
}

export interface CloseWeekBlock {
  type: "close_week";
  weekNumber: number;
  games: (BlockGameRow & { winner: "away" | "home" | "push" | null })[];
  // Names of this week's 6/6 winners (not season standings — a feed post is a social
  // summary, not a data dump; full league standings belong on the League page, reachable
  // via NF12's "View league results" CTA). Sep 7, 2026, Alex's live feedback on PIC-31:
  // replaces the original `standings` field, which showed full win/loss/push records for
  // up to 5 GMs — "way too much info/data" for a feed card. Optional so old posts (stored
  // block_data snapshots from before this change) don't break PostBlockContent's render.
  weeklyWinners?: string[];
}

export interface OpenTiebreakerBlock {
  type: "open_tiebreaker";
  game: BlockGameRow;
}

export type PostBlockData = OpenWeekBlock | CloseWeekBlock | OpenTiebreakerBlock;

export interface Post {
  id: string;
  author_roster_id: string;
  week_id: string | null;
  trigger: PostTrigger;
  message: string;
  image_url: string | null;
  block_data: PostBlockData | null;
  created_at: string;
}
