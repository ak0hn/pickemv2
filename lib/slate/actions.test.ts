import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable query-builder mock: every method returns itself, and the object resolves
// (via `then`) to whatever result was configured for the current call — matches how
// @supabase/supabase-js's PostgrestFilterBuilder is awaited directly.
function chainable(result: { data: unknown; error: unknown; count?: number }) {
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return (..._args: unknown[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mockFrom }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { checkSpreadEditImpact, applySpreadEdit, publishWeek, addGame } = await import(
  "./actions"
);

beforeEach(() => {
  mockFrom.mockReset();
});

describe("checkSpreadEditImpact (CT2b pre-confirm check)", () => {
  it("Given a game with no submitted picks, When checked, Then hasExistingPicks is false", async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }));
    const result = await checkSpreadEditImpact("game-1");
    expect(result).toEqual({ hasExistingPicks: false, affectedCount: 0 });
  });

  it("Given a game with 3 submitted picks, When checked, Then hasExistingPicks is true with the count", async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ roster_id: "a" }, { roster_id: "b" }, { roster_id: "c" }],
        error: null,
      })
    );
    const result = await checkSpreadEditImpact("game-1");
    expect(result).toEqual({ hasExistingPicks: true, affectedCount: 3 });
  });
});

describe("applySpreadEdit (CT2 / CT2b)", () => {
  it("Given a game with no existing picks, When the spread is edited, Then no picks are voided and no notifications are sent", async () => {
    const calls: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      calls.push(table);
      if (table === "picks") return chainable({ data: [], error: null });
      if (table === "games") return chainable({ data: null, error: null });
      return chainable({ data: null, error: null });
    });

    await applySpreadEdit("game-1", -6.5);

    // picks queried once (the existence check) and games updated once — no second
    // "picks" write (void) and no "notifications" insert.
    expect(calls.filter((t) => t === "picks").length).toBe(1);
    expect(calls).not.toContain("notifications");
  });

  it("Given GMs have already picked the game, When the spread is edited, Then their picks are voided and each gets a notification", async () => {
    const calls: { table: string }[] = [];
    mockFrom.mockImplementation((table: string) => {
      calls.push({ table });
      if (table === "picks" && calls.filter((c) => c.table === "picks").length === 1) {
        // first call: existence check
        return chainable({
          data: [{ id: "p1", roster_id: "r1" }, { id: "p2", roster_id: "r2" }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    await applySpreadEdit("game-1", -3);

    const tables = calls.map((c) => c.table);
    expect(tables).toContain("games"); // spread update
    expect(tables.filter((t) => t === "picks").length).toBe(2); // read + void update
    expect(tables).toContain("notifications"); // affected-GM notification
  });

  it("Given the games update fails (e.g. the DB trigger blocks a scored game), When applySpreadEdit runs, Then it throws instead of silently succeeding", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "picks") return chainable({ data: [], error: null });
      if (table === "games")
        return chainable({
          data: null,
          error: { message: "Spread cannot be edited once a game has been scored (game game-1)" },
        });
      return chainable({ data: null, error: null });
    });

    await expect(applySpreadEdit("game-1", 10)).rejects.toThrow(/scored/i);
  });
});

describe("publishWeek (CT4)", () => {
  it("Given a draft week with zero games, When publish is attempted, Then it throws and does not publish", async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null, count: 0 }));
    await expect(publishWeek("week-1")).rejects.toThrow(/at least one game/i);
  });

  it("Given a draft week with at least one game, When published, Then the week is updated with no error", async () => {
    let updateCalled = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === "games") return chainable({ data: null, error: null, count: 3 });
      if (table === "weeks") {
        updateCalled = true;
        return chainable({ data: null, error: null });
      }
      return chainable({ data: null, error: null });
    });

    await publishWeek("week-1");
    expect(updateCalled).toBe(true);
  });
});

describe("addGame (CT1 stub / CT3 manual entry)", () => {
  it("Given valid game details, When added, Then team abbreviations are normalized to uppercase", async () => {
    let insertedRow: Record<string, unknown> | null = null;
    mockFrom.mockImplementation(() => {
      return new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "insert") {
              return (row: Record<string, unknown>) => {
                insertedRow = row;
                return chainable({ data: null, error: null });
              };
            }
            if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
            return () => chainable({ data: null, error: null });
          },
        }
      );
    });

    await addGame({
      weekId: "week-1",
      awayTeam: "nyj",
      homeTeam: "buf",
      kickoffAt: new Date().toISOString(),
      spread: -6.5,
    });

    expect(insertedRow).toMatchObject({ away_team: "NYJ", home_team: "BUF" });
  });
});
