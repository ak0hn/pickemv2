import { MockGM, MockGame, MockPost, MockStanding } from "./types";

// Deterministic pseudo-random helper so results/standings stay stable within a session.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export const MOCK_GMS: MockGM[] = [
  { id: "gm-1", name: "Jordan P.", role: "commissioner" },
  { id: "gm-2", name: "Sam T.", role: "commissioner" }, // co-commissioner
  { id: "gm-3", name: "Riley M.", role: "gm" },
  { id: "gm-4", name: "Casey B.", role: "gm" },
  { id: "gm-5", name: "Drew H.", role: "gm" },
  { id: "gm-6", name: "Quinn A.", role: "gm" },
  { id: "gm-7", name: "Morgan L.", role: "gm" },
];

const MATCHUPS: { away: string; home: string; spread: number }[] = [
  { away: "NYJ", home: "BUF", spread: -6.5 },
  { away: "MIA", home: "NE", spread: -2.5 },
  { away: "CIN", home: "BAL", spread: -3 },
  { away: "DET", home: "GB", spread: -1.5 },
  { away: "SF", home: "SEA", spread: -4 },
  { away: "DAL", home: "PHI", spread: -5.5 },
  { away: "KC", home: "LAC", spread: -3.5 },
];

// Thursday that opens the given week offset from the current real week (0 = this week).
function weekAnchor(weekOffset: number): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun ... 4 = Thu
  const diffToThu = (day - 4 + 7) % 7;
  const thisThu = new Date(now);
  thisThu.setHours(20, 15, 0, 0);
  thisThu.setDate(now.getDate() - diffToThu);
  thisThu.setDate(thisThu.getDate() + weekOffset * 7);
  return thisThu;
}

export function getWeekGames(weekOffset: number): MockGame[] {
  const thu = weekAnchor(weekOffset);
  const sunEarly = new Date(thu);
  sunEarly.setDate(thu.getDate() + 3);
  sunEarly.setHours(13, 0, 0, 0);
  const sunLate = new Date(sunEarly);
  sunLate.setHours(16, 5, 0, 0);
  const snf = new Date(sunEarly);
  snf.setHours(20, 20, 0, 0);
  const mnf = new Date(thu);
  mnf.setDate(thu.getDate() + 4);
  mnf.setHours(20, 15, 0, 0);

  const slots: { slot: MockGame["slot"]; kickoff: Date; isTiebreaker: boolean }[] = [
    { slot: "TNF", kickoff: thu, isTiebreaker: false },
    { slot: "SUN_EARLY", kickoff: sunEarly, isTiebreaker: false },
    { slot: "SUN_EARLY", kickoff: sunEarly, isTiebreaker: false },
    { slot: "SUN_LATE", kickoff: sunLate, isTiebreaker: false },
    { slot: "SUN_LATE", kickoff: sunLate, isTiebreaker: false },
    { slot: "SNF", kickoff: snf, isTiebreaker: false },
    { slot: "MNF", kickoff: mnf, isTiebreaker: true },
  ];

  return slots.map((s, i) => {
    const m = MATCHUPS[i % MATCHUPS.length];
    return {
      id: `w${weekOffset}-g${i}`,
      slot: s.slot,
      away: m.away,
      home: m.home,
      spread: m.spread,
      kickoff: s.kickoff,
      isTiebreaker: s.isTiebreaker,
    };
  });
}

export function isGameFinal(game: MockGame, now: Date): boolean {
  const duration = 3.25 * 60 * 60 * 1000;
  return now.getTime() > game.kickoff.getTime() + duration;
}

export function isGameLocked(game: MockGame, now: Date): boolean {
  return now.getTime() >= game.kickoff.getTime();
}

// Deterministic ATS winner once a game is final.
export function gameWinnerAgainstSpread(game: MockGame): "home" | "away" | "push" {
  const h = hashStr(game.id) % 20;
  if (h === 0) return "push";
  return h % 2 === 0 ? "home" : "away";
}

export type WeekPhase =
  | "pre-lock"
  | "in-progress"
  | "awaiting-tiebreaker"
  | "tiebreaker-open"
  | "week-complete";

export function getWeekPhase(weekOffset: number, now: Date, tiebreakerInvoked: boolean): WeekPhase {
  const games = getWeekGames(weekOffset);
  const regular = games.filter((g) => !g.isTiebreaker);
  const mnf = games.find((g) => g.isTiebreaker)!;

  const anyLocked = regular.some((g) => isGameLocked(g, now));
  const allRegularFinal = regular.every((g) => isGameFinal(g, now));
  const mnfFinal = isGameFinal(mnf, now);

  if (!anyLocked) return "pre-lock";
  if (!allRegularFinal) return "in-progress";
  if (allRegularFinal && !mnfFinal && tiebreakerInvoked) return "tiebreaker-open";
  if (allRegularFinal && !mnfFinal && !tiebreakerInvoked) return "awaiting-tiebreaker";
  return "week-complete";
}

export function getMockPosts(weekOffset: number): MockPost[] {
  const thu = weekAnchor(weekOffset);
  const opened = new Date(thu);
  opened.setDate(thu.getDate() - 1);
  return [
    {
      id: `post-${weekOffset}-open`,
      author: "Jordan P.",
      body: `Week ${13 + weekOffset} is open — lines are posted, picks close at kickoff for each game. Good luck.`,
      postedAt: opened,
      reactions: 4,
      comments: [{ author: "Casey B.", body: "Locking in the dog on TNF 👀" }],
    },
    {
      id: `post-${weekOffset}-mid`,
      author: "Jordan P.",
      body: "Reminder: Sunday early games lock at 1pm ET, not before kickoff of the whole slate.",
      postedAt: new Date(thu.getTime() + 6 * 60 * 60 * 1000),
      reactions: 2,
      comments: [],
    },
  ];
}

export function getMockStandings(): MockStanding[] {
  return MOCK_GMS.map((gm) => {
    const h = hashStr(gm.id);
    const wins = 30 + (h % 12);
    const losses = 30 + ((h >> 2) % 12);
    const pushes = h % 4;
    return { gmId: gm.id, name: gm.name, wins, losses, pushes };
  }).sort((a, b) => b.wins - a.wins);
}
