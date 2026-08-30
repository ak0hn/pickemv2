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
  standings: { name: string; wins: number; losses: number; pushes: number }[];
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
