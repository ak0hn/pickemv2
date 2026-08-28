export type WeekState = "draft" | "published" | "closed";
export type GameStatus = "scheduled" | "voided" | "final";

export interface SlateGame {
  id: string;
  week_id: string;
  away_team: string;
  home_team: string;
  spread: number | null;
  kickoff_at: string;
  status: GameStatus;
  home_score: number | null;
  away_score: number | null;
}

export interface SlateWeek {
  id: string;
  week_number: number;
  state: WeekState;
  closed_at: string | null;
}

export interface SlateData {
  week: SlateWeek;
  games: SlateGame[];
}
