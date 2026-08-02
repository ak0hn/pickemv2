export type Role = "commissioner" | "gm";

export interface MockGM {
  id: string;
  name: string;
  role: Role;
}

export interface MockGame {
  id: string;
  slot: "TNF" | "SUN_EARLY" | "SUN_LATE" | "SNF" | "MNF";
  away: string;
  home: string;
  spread: number; // negative favors home
  kickoff: Date;
  isTiebreaker: boolean;
}

export interface MockPost {
  id: string;
  author: string;
  body: string;
  postedAt: Date;
  reactions: number;
  comments: { author: string; body: string }[];
}

export interface MockStanding {
  gmId: string;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
}
