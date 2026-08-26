import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable query-builder mock: every method returns itself, and the object resolves
// (via `then`) to whatever result was configured for the current call — matches how
// @supabase/supabase-js's PostgrestFilterBuilder is awaited directly. Calls to methods
// that matter for assertions (update/insert/single/rpc) are recorded with their args.
function chainable(
  result: { data: unknown; error: unknown; count?: number },
  onCall?: (method: string, args: unknown[]) => void
) {
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

const { checkSpreadEditImpact, applySpreadEdit, publishWeek, addGame } = await import(
  "./actions"
);

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("checkSpreadEditImpact (CT2b pre-confirm check)", () => {
  it("Given a game with no submitted picks, When checked, Then hasExistingPicks is false", async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null, count: 0 }));
    const result = await checkSpreadEditImpact("game-1");
    expect(result).toEqual({ hasExistingPicks: false, affectedCount: 0 });
  });

  it("Given a game with 3 submitted picks, When checked, Then hasExistingPicks is true with the exact count", async () => {
    // count is deliberately higher than data.length to prove the exact `count` is used,
    // not the (max_rows-capped) returned array length.
    mockFrom.mockReturnValue(
      chainable({ data: [{ roster_id: "a" }, { roster_id: "b" }], error: null, count: 3 })
    );
    const result = await checkSpreadEditImpact("game-1");
    expect(result).toEqual({ hasExistingPicks: true, affectedCount: 3 });
  });
});

describe("applySpreadEdit (CT2 / CT2b)", () => {
  it("Given picks exist for the game, When the spread is edited, Then it calls the atomic apply_spread_edit RPC with the game id and new spread", async () => {
    mockRpc.mockResolvedValue({ data: [{ affected_count: 2 }], error: null });

    await applySpreadEdit("game-1", -3);

    expect(mockRpc).toHaveBeenCalledWith("apply_spread_edit", {
      p_game_id: "game-1",
      p_new_spread: -3,
    });
    // Exactly one write path — void+notify is NOT a separate client-side step, it's
    // inside the same transaction as the spread update.
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("Given a null spread (the commissioner cleared the field), When applySpreadEdit runs, Then null is passed through rather than coerced to 0", async () => {
    mockRpc.mockResolvedValue({ data: [{ affected_count: 0 }], error: null });

    await applySpreadEdit("game-1", null);

    expect(mockRpc).toHaveBeenCalledWith("apply_spread_edit", {
      p_game_id: "game-1",
      p_new_spread: null,
    });
  });

  it("Given the RPC fails (e.g. the DB trigger blocks a scored game), When applySpreadEdit runs, Then it throws instead of silently succeeding", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Spread cannot be edited once a game has been scored (game game-1)" },
    });

    await expect(applySpreadEdit("game-1", 10)).rejects.toThrow(/scored/i);
  });
});

describe("publishWeek (CT4)", () => {
  it("Given a week that's already closed, When publish is attempted, Then it throws and never checks or updates games", async () => {
    let gamesQueried = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { state: "closed" }, error: null });
      if (table === "games") gamesQueried = true;
      return chainable({ data: null, error: null });
    });

    await expect(publishWeek("week-1")).rejects.toThrow(/closed/i);
    expect(gamesQueried).toBe(false);
  });

  it("Given a draft week with zero games, When publish is attempted, Then it throws and does not update the week", async () => {
    let weekUpdateArgs: unknown = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") {
        return chainable({ data: { state: "draft" }, error: null }, (method, args) => {
          if (method === "update") weekUpdateArgs = args[0];
        });
      }
      if (table === "games") return chainable({ data: null, error: null, count: 0 });
      return chainable({ data: null, error: null });
    });

    await expect(publishWeek("week-1")).rejects.toThrow(/at least one game/i);
    expect(weekUpdateArgs).toBeNull();
  });

  it("Given a draft week with at least one game, When published, Then the week row is updated with state: 'published'", async () => {
    let weekUpdateArgs: Record<string, unknown> | null = null;
    let weekCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") {
        weekCallCount += 1;
        if (weekCallCount === 1) {
          // the pre-check select
          return chainable({ data: { state: "draft" }, error: null });
        }
        // the actual publish update
        return chainable({ data: null, error: null }, (method, args) => {
          if (method === "update") weekUpdateArgs = args[0] as Record<string, unknown>;
        });
      }
      if (table === "games") return chainable({ data: null, error: null, count: 3 });
      return chainable({ data: null, error: null });
    });

    await publishWeek("week-1");
    expect(weekUpdateArgs).toEqual({ state: "published" });
  });
});

describe("addGame (CT1 stub / CT3 manual entry)", () => {
  it("Given valid game details, When added, Then team abbreviations are normalized to uppercase", async () => {
    let insertedRow: Record<string, unknown> | null = null;
    mockFrom.mockReturnValue(
      chainable({ data: null, error: null }, (method, args) => {
        if (method === "insert") insertedRow = args[0] as Record<string, unknown>;
      })
    );

    await addGame({
      weekId: "week-1",
      awayTeam: "nyj",
      homeTeam: "buf",
      kickoffAt: new Date().toISOString(),
      spread: -6.5,
    });

    expect(insertedRow).toMatchObject({ away_team: "NYJ", home_team: "BUF" });
  });

  it("Given an unparseable kickoff timestamp, When addGame is called, Then it throws before touching the database", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("should not reach the database");
    });

    await expect(
      addGame({
        weekId: "week-1",
        awayTeam: "NYJ",
        homeTeam: "BUF",
        kickoffAt: "not-a-real-date",
        spread: null,
      })
    ).rejects.toThrow(/invalid/i);
  });
});
