// PIC-19: pure formatting helpers for the Slate Builder's game rows, mirroring the
// commissioner's real email table (day, kickoff time, explicitly-labeled home spread).
// Kept separate from SlateBuilder.tsx so the formatting logic is unit-testable without
// rendering the component.

// Pinned to en-US/America-New_York — these are real NFL games with a fixed real-world
// schedule, not viewer-relative events. Using the browser's own locale/timezone (the
// naive `undefined` default) breaks two ways: a non-English browser locale renders
// non-uppercasable day abbreviations (e.g. "木" for Thursday under ja-JP, ".toUpperCase()"
// can't fix that), and a non-ET browser timezone silently shows the wrong clock time with
// no indication which zone it's in. Matches the existing formatKickoff precedent in
// lib/posts/actions.ts (E4 finding — this file originally used `undefined`).
const TEAM_TIMEZONE = "America/New_York";

export function formatGameDay(kickoffAt: string): string {
  return new Date(kickoffAt)
    .toLocaleDateString("en-US", { weekday: "short", timeZone: TEAM_TIMEZONE })
    .toUpperCase();
}

export function formatKickoffTime(kickoffAt: string): string {
  return new Date(kickoffAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TEAM_TIMEZONE,
    timeZoneName: "short",
  });
}

// Signed so "which side favors" is unambiguous without a team-prefix convention — a
// positive home spread means the home team is the underdog (getting points), negative
// means favored, matching games.spread's existing documented convention. Exactly 0 is a
// pick'em, shown as "PK" per sports convention (not a bare, sign-less "0") — matches the
// existing convention in components/composer/PostComposer.tsx's formatSpreadLine (E4
// finding — this was a second, diverging convention for the same value before the fix).
export function formatHomeSpread(spread: number | null): string {
  if (spread === null) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}
