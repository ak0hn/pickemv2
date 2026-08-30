import { describe, it, expect, vi, beforeEach } from "vitest";

// Same chainable query-builder mock as lib/slate/actions.test.ts — resolves to a
// per-call-configured result, records calls that matter for assertions.
function chainable(result: { data: unknown; error: unknown }, onCall?: (method: string, args: unknown[]) => void) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return (...args: unknown[]) => {
        onCall?.(String(prop), args);
        return new Proxy({}, handler);
      };
    },
  };
  return new Proxy({}, handler);
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mockFrom }),
}));

const { getPickTrackerAction } = await import("./actions");

beforeEach(() => {
  mockFrom.mockReset();
});

const WEEK = { id: "week-1", week_number: 1, state: "published", closed_at: null };
const GAMES = [
  {
    id: "game-1",
    week_id: "week-1",
    away_team: "NE",
    home_team: "SEA",
    spread: -3,
    kickoff_at: "2026-09-10T17:00:00Z",
    status: "scheduled",
    home_score: null,
    away_score: null,
  },
];
const ROSTER = [{ id: "roster-1", display_name: "Dev GM", email: "dev-gm@pickemv2.test" }];
const PICKS = [{ game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" }];

function mockSequence(results: Array<{ data: unknown; error: unknown }>) {
  let call = 0;
  mockFrom.mockImplementation(() => chainable(results[call++] ?? { data: null, error: null }));
}

describe("getPickTrackerAction (CT5)", () => {
  it("Given a published week with games, roster, and picks, When loaded, Then it returns the full tracker snapshot", async () => {
    mockSequence([
      { data: WEEK, error: null },
      { data: GAMES, error: null },
      { data: ROSTER, error: null },
      { data: PICKS, error: null },
    ]);

    const result = await getPickTrackerAction();

    expect(result).toEqual({ week: WEEK, games: GAMES, roster: ROSTER, picks: PICKS });
  });

  it("Given no active week exists, When loaded, Then it returns null rather than throwing", async () => {
    mockSequence([{ data: null, error: null }]);

    const result = await getPickTrackerAction();

    expect(result).toBeNull();
  });

  it("Given a week with zero games, When loaded, Then it skips the picks query entirely (no game ids to filter on)", async () => {
    mockSequence([
      { data: WEEK, error: null },
      { data: [], error: null },
      { data: ROSTER, error: null },
    ]);

    const result = await getPickTrackerAction();

    expect(result).toEqual({ week: WEEK, games: [], roster: ROSTER, picks: [] });
    // Only 3 calls to .from() — weeks, games, roster — the picks table is never queried.
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it("Given the roster query errors, When loaded, Then it returns null rather than a partial snapshot", async () => {
    mockSequence([
      { data: WEEK, error: null },
      { data: GAMES, error: null },
      { data: null, error: { message: "boom" } },
    ]);

    const result = await getPickTrackerAction();

    expect(result).toBeNull();
  });
});
