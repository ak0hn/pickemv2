// Shared by lib/posts/actions.ts and lib/results/compute.ts — moved out of actions.ts
// (PIC-24) so both can use the same kickoff label without duplicating it.
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}
