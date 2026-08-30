// PIC-19: pure formatting helpers for the Slate Builder's game rows, mirroring the
// commissioner's real email table (day, kickoff time, explicitly-labeled home spread).
// Kept separate from SlateBuilder.tsx so the formatting logic is unit-testable without
// rendering the component.

export function formatGameDay(kickoffAt: string): string {
  return new Date(kickoffAt).toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
}

export function formatKickoffTime(kickoffAt: string): string {
  return new Date(kickoffAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Signed so "which side favors" is unambiguous without a team-prefix convention — a
// positive home spread means the home team is the underdog (getting points), negative
// means favored, matching games.spread's existing documented convention.
export function formatHomeSpread(spread: number | null): string {
  if (spread === null) return "—";
  return spread > 0 ? `+${spread}` : `${spread}`;
}
