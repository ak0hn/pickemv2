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
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mockFrom, rpc: mockRpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// getPickTrackerAction reuses getActiveSlate() for the week+games half (E4 fix — this
// used to duplicate that query verbatim) — mocked directly so this test only needs to
// exercise the roster/picks half that's actually new in this ticket.
const mockGetActiveSlate = vi.fn();
vi.mock("@/lib/slate/queries", () => ({
  getActiveSlate: () => mockGetActiveSlate(),
}));

const { getPickTrackerAction, applyPickCorrection } = await import("./actions");

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockGetActiveSlate.mockReset();
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
    mockGetActiveSlate.mockResolvedValue({ week: WEEK, games: GAMES });
    mockSequence([
      { data: ROSTER, error: null },
      { data: PICKS, error: null },
    ]);

    const result = await getPickTrackerAction();

    expect(result).toEqual({ week: WEEK, games: GAMES, roster: ROSTER, picks: PICKS });
  });

  it("Given no active week exists, When loaded, Then it returns null rather than throwing", async () => {
    mockGetActiveSlate.mockResolvedValue(null);

    const result = await getPickTrackerAction();

    expect(result).toBeNull();
    // Roster/picks should never be queried once there's no active week to scope them to.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("Given a week with zero games, When loaded, Then it skips the picks query entirely (no game ids to filter on)", async () => {
    mockGetActiveSlate.mockResolvedValue({ week: WEEK, games: [] });
    mockSequence([{ data: ROSTER, error: null }]);

    const result = await getPickTrackerAction();

    expect(result).toEqual({ week: WEEK, games: [], roster: ROSTER, picks: [] });
    // Only 1 call to .from() — roster — the picks table is never queried.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("Given the roster query errors, When loaded, Then it returns null rather than a partial snapshot", async () => {
    mockGetActiveSlate.mockResolvedValue({ week: WEEK, games: GAMES });
    mockSequence([{ data: null, error: { message: "boom" } }]);

    const result = await getPickTrackerAction();

    expect(result).toBeNull();
  });

  it("Given the picks query errors, When loaded, Then it returns null rather than a partial snapshot", async () => {
    mockGetActiveSlate.mockResolvedValue({ week: WEEK, games: GAMES });
    mockSequence([
      { data: ROSTER, error: null },
      { data: null, error: { message: "boom" } },
    ]);

    const result = await getPickTrackerAction();

    expect(result).toBeNull();
  });
});

describe("applyPickCorrection (CT6)", () => {
  it("Given a correction, When applied successfully, Then it calls the atomic apply_pick_correction RPC with the game, roster, and pick value", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await applyPickCorrection({ gameId: "game-1", rosterId: "roster-1", pickValue: "NE" });

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("apply_pick_correction", {
      p_game_id: "game-1",
      p_roster_id: "roster-1",
      p_pick_value: "NE",
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("Given the RPC rejects (e.g. a non-commissioner caller, or a value that isn't one of the two teams), When applied, Then it returns the real error message rather than throwing", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Pick value must be one of the two teams playing in this game" },
    });

    const result = await applyPickCorrection({ gameId: "game-1", rosterId: "roster-1", pickValue: "XYZ" });

    expect(result).toEqual({
      ok: false,
      error: "Pick value must be one of the two teams playing in this game",
    });
  });
});
