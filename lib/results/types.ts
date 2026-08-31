export interface WeekResultGameRow {
  away: string;
  home: string;
  spread: number | null;
  kickoffLabel: string;
  winner: "away" | "home" | "push" | null;
}

export interface StandingsRow {
  rosterId: string;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
}

// Full week's results + full league standings (not sliced) — the shared, non-mutating
// computation PIC-24 exists for. PIC-22's buildCloseWeekBlock takes the top 5 of
// `standings` for the announcement post; PIC-24's preview shows all of it; PIC-26/27
// (tiebreaker week, League page) are expected to reuse this same shape rather than
// reimplementing the computation.
//
// weeklyWinners (added Aug 31, 2026, Alex's live spot-check): names of GMs who went 6/6
// on THIS week's own picks specifically — distinct from `standings`, which is
// season-to-date cumulative. Per the league's confirmed rule, only a perfect week counts
// as "winning" it (not merely the highest score that week) — see
// PROJECT_CONTEXT.md's tiebreaker Confirmed Mechanics.
export interface WeekResults {
  weekNumber: number;
  games: WeekResultGameRow[];
  standings: StandingsRow[];
  weeklyWinners: string[];
}
