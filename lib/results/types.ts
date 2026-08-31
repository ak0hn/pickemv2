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
export interface WeekResults {
  weekNumber: number;
  games: WeekResultGameRow[];
  standings: StandingsRow[];
}
