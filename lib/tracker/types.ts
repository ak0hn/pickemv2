import type { SlateGame, SlateWeek } from "@/lib/slate/types";

export interface TrackerRoster {
  id: string;
  display_name: string | null;
  email: string;
}

// Commish sees full pick_value (WP6's GM-to-GM privacy rule doesn't apply to the
// commissioner — CT5's AC is an explicit, deliberate exception, not a leak).
export interface TrackerPick {
  game_id: string;
  roster_id: string;
  pick_value: string | null;
  pick_status: "submitted" | "voided" | "scored";
}

export interface TrackerData {
  week: SlateWeek;
  games: SlateGame[];
  roster: TrackerRoster[];
  picks: TrackerPick[];
}
