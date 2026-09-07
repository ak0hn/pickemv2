// PIC-31: compact relative-timestamp formatting for feed post cards (Design System's
// Epic 4 section specifies "e.g. '2h ago'" — date-fns's own formatDistanceToNowStrict
// produces the verbose "2 hours ago", not this compact form, so a small custom formatter
// matches the locked spec exactly rather than fighting a library's defaults).
//
// `now` is a parameter, not `new Date()` read internally, so this stays pure/testable
// without mocking global Date — same approach as this project's other format helpers.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  // Beyond a week, a relative count stops being useful — fall back to a real date,
  // pinned to ET like every other timestamp in this app (lib/slate/format.ts).
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}
