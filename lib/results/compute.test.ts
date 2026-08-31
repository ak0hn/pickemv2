import { describe, it, expect, vi, beforeEach } from "vitest";

function chainable(result: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mockFrom }),
}));

const { computeWeekResults } = await import("./compute");

beforeEach(() => {
  mockFrom.mockReset();
});

const FINAL_GAME = {
  id: "game-1",
  away_team: "NYJ",
  home_team: "BUF",
  spread: -6.5,
  kickoff_at: "2026-09-17T20:20:00Z",
  status: "final",
  home_score: 24,
  away_score: 17, // margin = 24 - 17 - 6.5 = 0.5 -> home covers
};

const SIX_GMS = Array.from({ length: 6 }, (_, i) => ({ id: `roster-${i + 1}`, display_name: `GM ${i + 1}` }));

describe("computeWeekResults (PIC-24)", () => {
  it("Given more than 5 GMs, When results are computed, Then standings include everyone — not sliced to a top-5 snippet the way buildCloseWeekBlock's post-facing block is", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [FINAL_GAME], error: null });
      if (table === "roster") return chainable({ data: SIX_GMS, error: null });
      if (table === "picks") return chainable({ data: [], error: null }); // nobody picked — everyone takes a loss
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.standings).toHaveLength(6);
  });

  it("Given a final game where home covers, When results are computed, Then the game's winner is 'home' and standings reflect the ATS outcome", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [FINAL_GAME], error: null });
      if (table === "roster") {
        return chainable({
          data: [
            { id: "roster-1", display_name: "Alex" },
            { id: "roster-2", display_name: "Sam" },
          ],
          error: null,
        });
      }
      if (table === "picks") {
        return chainable({
          data: [
            { roster_id: "roster-1", game_id: "game-1", pick_value: "BUF", pick_status: "scored", is_correct: true },
            { roster_id: "roster-2", game_id: "game-1", pick_value: "NYJ", pick_status: "scored", is_correct: false },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.games[0]).toMatchObject({ away: "NYJ", home: "BUF", winner: "home" });
    expect(results.standings).toContainEqual({ rosterId: "roster-1", name: "Alex", wins: 1, losses: 0, pushes: 0 });
    expect(results.standings).toContainEqual({ rosterId: "roster-2", name: "Sam", wins: 0, losses: 1, pushes: 0 });
  });

  it("Given a pick that's still 'submitted' (not yet scored by week_close), When results are computed, Then its outcome is derived on the fly — this is what makes the preview safe to show before the week is closed", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [FINAL_GAME], error: null });
      if (table === "roster") return chainable({ data: [{ id: "roster-1", display_name: "Alex" }], error: null });
      if (table === "picks") {
        return chainable({
          data: [{ roster_id: "roster-1", game_id: "game-1", pick_value: "BUF", pick_status: "submitted", is_correct: null }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.standings).toContainEqual({ rosterId: "roster-1", name: "Alex", wins: 1, losses: 0, pushes: 0 });
  });

  it("Given a game that lands exactly on the spread and a submitted pick on it, When results are computed, Then it counts as a push, not a loss", async () => {
    const pushGame = { ...FINAL_GAME, home_score: 24, away_score: 17.5 }; // margin = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [pushGame], error: null });
      if (table === "roster") return chainable({ data: [{ id: "roster-1", display_name: "Alex" }], error: null });
      if (table === "picks") {
        return chainable({
          data: [{ roster_id: "roster-1", game_id: "game-1", pick_value: "BUF", pick_status: "submitted", is_correct: null }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.standings).toContainEqual({ rosterId: "roster-1", name: "Alex", wins: 0, losses: 0, pushes: 1 });
  });

  it("Given a push game closed by week_close(), When a GM never picked (the synthetic null pick_value row week_close() inserts), Then it counts as a loss, not a push — regression test for the E4 finding that a post-close push game misread the synthetic row as a real, unmatched pick", async () => {
    const pushGame = { ...FINAL_GAME, home_score: 24, away_score: 17.5 }; // margin = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [pushGame], error: null });
      if (table === "roster") return chainable({ data: [{ id: "roster-1", display_name: "Alex" }], error: null });
      if (table === "picks") {
        return chainable({
          data: [{ roster_id: "roster-1", game_id: "game-1", pick_value: null, pick_status: "scored", is_correct: false }],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.standings).toContainEqual({ rosterId: "roster-1", name: "Alex", wins: 0, losses: 1, pushes: 0 });
  });

  it("Given a roster member with no pick at all on a final game, When standings are aggregated, Then it counts as a loss even if the game itself was a push", async () => {
    const pushGame = { ...FINAL_GAME, home_score: 24, away_score: 17.5 }; // margin = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [pushGame], error: null });
      if (table === "roster") return chainable({ data: [{ id: "roster-1", display_name: "Alex" }], error: null });
      if (table === "picks") return chainable({ data: [], error: null }); // no pick row for Alex on this game
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.standings).toContainEqual({ rosterId: "roster-1", name: "Alex", wins: 0, losses: 1, pushes: 0 });
  });

  it("Given no final games yet this week, When results are computed, Then every GM's standings line is 0-0-0 rather than throwing or omitting anyone", async () => {
    const notFinalGame = { ...FINAL_GAME, status: "scheduled", home_score: null, away_score: null };
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [notFinalGame], error: null });
      if (table === "roster") return chainable({ data: [{ id: "roster-1", display_name: "Alex" }], error: null });
      if (table === "picks") return chainable({ data: [], error: null });
      return chainable({ data: null, error: null });
    });

    const results = await computeWeekResults("week-1");
    expect(results.games[0].winner).toBeNull();
    expect(results.standings).toContainEqual({ rosterId: "roster-1", name: "Alex", wins: 0, losses: 0, pushes: 0 });
  });
});
