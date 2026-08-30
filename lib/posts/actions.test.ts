import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OpenWeekBlock, CloseWeekBlock } from "./types";

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
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { buildOpenWeekBlock, publishWeekWithPost, createFreeformPost, buildCloseWeekBlock, closeWeekWithPost } =
  await import("./actions");

const FAKE_USER = { data: { user: { id: "auth-user-1" } }, error: null };
const FAKE_ROSTER = { data: { id: "roster-1" }, error: null };

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue(FAKE_USER);
});

describe("buildOpenWeekBlock (CT17)", () => {
  it("Given a week's games, When the block is built, Then games are sorted by kickoff and the week number is included", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 3 }, error: null });
      if (table === "games") {
        return chainable({
          data: [
            {
              away_team: "NYJ",
              home_team: "BUF",
              spread: -6.5,
              kickoff_at: "2026-09-17T20:20:00Z",
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const block = await buildOpenWeekBlock("week-1");
    expect(block.type).toBe("open_week");
    expect(block.weekNumber).toBe(3);
    expect(block.games).toHaveLength(1);
    expect(block.games[0]).toMatchObject({ away: "NYJ", home: "BUF", spread: -6.5 });
  });
});

describe("publishWeekWithPost (CT4 + CT17 coupling)", () => {
  const block: OpenWeekBlock = { type: "open_week", weekNumber: 1, games: [] };

  it("Given a signed-in commissioner with an attached image, When publishing, Then it calls the atomic RPC with the resolved roster id, message, block, and image URL", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roster") return chainable(FAKE_ROSTER);
      return chainable({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: null, error: null });

    await publishWeekWithPost({
      weekId: "week-1",
      message: "Slate's up!",
      block,
      imageUrl: "https://example.supabase.co/storage/v1/object/public/post-images/roster-1/1.jpg",
    });

    expect(mockRpc).toHaveBeenCalledWith("publish_week_with_post", {
      p_week_id: "week-1",
      p_author_roster_id: "roster-1",
      p_message: "Slate's up!",
      p_block_data: block,
      p_image_url: "https://example.supabase.co/storage/v1/object/public/post-images/roster-1/1.jpg",
    });
  });

  it("Given no image was attached, When publishing, Then p_image_url is passed as null, not omitted", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roster") return chainable(FAKE_ROSTER);
      return chainable({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: null, error: null });

    await publishWeekWithPost({ weekId: "week-1", message: "Slate's up!", block, imageUrl: null });

    expect(mockRpc).toHaveBeenCalledWith(
      "publish_week_with_post",
      expect.objectContaining({ p_image_url: null })
    );
  });

  it("Given the RPC rejects (e.g. a game is still missing a spread), When publishing, Then it returns that message as a value instead of throwing — thrown Server Action errors get redacted to a generic message in production, so an expected validation failure like this must come back as data, not an exception", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roster") return chainable(FAKE_ROSTER);
      return chainable({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "2 games still need a spread before publishing" },
    });

    const result = await publishWeekWithPost({ weekId: "week-1", message: "", block, imageUrl: null });

    expect(result).toEqual({ ok: false, error: "2 games still need a spread before publishing" });
  });

  it("Given no signed-in user, When publishing, Then it throws before calling the RPC at all", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      publishWeekWithPost({ weekId: "week-1", message: "", block, imageUrl: null })
    ).rejects.toThrow(/not signed in/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("buildCloseWeekBlock (CT18)", () => {
  it("Given a final game where home covers, When the block is built, Then the game's winner is 'home' and standings are aggregated from scored picks", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") {
        return chainable({
          data: [
            {
              away_team: "NYJ",
              home_team: "BUF",
              spread: -6.5,
              kickoff_at: "2026-09-17T20:20:00Z",
              status: "final",
              home_score: 24,
              away_score: 17,
            },
          ],
          error: null,
        });
      }
      if (table === "picks") {
        return chainable({
          data: [
            {
              is_correct: true,
              roster_id: "roster-1",
              roster: { display_name: "Alex" },
              games: { home_score: 24, away_score: 17, spread: -6.5 },
            },
            {
              is_correct: false,
              roster_id: "roster-2",
              roster: { display_name: "Sam" },
              games: { home_score: 24, away_score: 17, spread: -6.5 },
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const block = await buildCloseWeekBlock("week-1");
    expect(block.type).toBe("close_week");
    expect(block.games[0]).toMatchObject({ away: "NYJ", home: "BUF", winner: "home" });
    expect(block.standings).toContainEqual({ name: "Alex", wins: 1, losses: 0, pushes: 0 });
    expect(block.standings).toContainEqual({ name: "Sam", wins: 0, losses: 1, pushes: 0 });
  });

  it("Given a game that lands exactly on the spread, When standings are aggregated, Then the pick counts as a push, not a loss", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "weeks") return chainable({ data: { week_number: 1 }, error: null });
      if (table === "games") return chainable({ data: [], error: null });
      if (table === "picks") {
        return chainable({
          data: [
            {
              is_correct: false,
              roster_id: "roster-1",
              roster: { display_name: "Alex" },
              games: { home_score: 24, away_score: 17.5, spread: -6.5 }, // margin = 0
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const block = await buildCloseWeekBlock("week-1");
    expect(block.standings).toContainEqual({ name: "Alex", wins: 0, losses: 0, pushes: 1 });
  });
});

describe("closeWeekWithPost (CT18)", () => {
  const block: CloseWeekBlock = { type: "close_week", weekNumber: 1, games: [], standings: [] };

  it("Given a signed-in commissioner, When closing the week, Then it calls close_week_with_post with the resolved roster id", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roster") return chainable(FAKE_ROSTER);
      return chainable({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: null, error: null });

    await closeWeekWithPost({ weekId: "week-1", message: "Results are in!", block, imageUrl: null });

    expect(mockRpc).toHaveBeenCalledWith("close_week_with_post", {
      p_week_id: "week-1",
      p_author_roster_id: "roster-1",
      p_message: "Results are in!",
      p_block_data: block,
      p_image_url: null,
    });
  });

  it("Given the RPC rejects (e.g. the week is already closed by another path), When closing, Then it returns that message as a value instead of throwing", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roster") return chainable(FAKE_ROSTER);
      return chainable({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: null, error: { message: "Week not found" } });

    const result = await closeWeekWithPost({ weekId: "week-1", message: "", block, imageUrl: null });

    expect(result).toEqual({ ok: false, error: "Week not found" });
  });
});

describe("createFreeformPost (CT17 free-form trigger)", () => {
  it("Given a message and no image, When posted, Then it inserts a freeform post with a null block", async () => {
    let insertedRow: Record<string, unknown> | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "roster") return chainable(FAKE_ROSTER);
      if (table === "posts") {
        return chainable({ data: null, error: null }, (method, args) => {
          if (method === "insert") insertedRow = args[0] as Record<string, unknown>;
        });
      }
      return chainable({ data: null, error: null });
    });

    await createFreeformPost({ message: "Good luck this week", imageUrl: null });

    expect(insertedRow).toMatchObject({
      trigger: "freeform",
      message: "Good luck this week",
      block_data: null,
    });
  });
});
