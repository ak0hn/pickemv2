// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { PickTracker } from "./PickTracker";

afterEach(cleanup);

// Same lucide-react stand-in as PostComposer.test.tsx (PIC-11) — the barrel export hangs
// this project's vitest 4.1.11 + jsdom combination, and the icon carries no behavior
// these tests need to verify.
vi.mock("lucide-react", () => ({
  Lock: () => <span data-testid="icon-lock" />,
}));

vi.mock("@/lib/dev/DevProvider", () => ({
  useDev: () => ({ now: new Date("2026-09-10T12:00:00Z") }),
}));

const mockGetPickTracker = vi.fn();
vi.mock("@/lib/tracker/actions", () => ({
  getPickTrackerAction: () => mockGetPickTracker(),
}));

// Captures the subscribe callback so tests can drive realtime status transitions
// directly, rather than depending on real network/socket behavior.
let subscribeCallback: ((status: string) => void) | null = null;
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb: (status: string) => void) => {
    subscribeCallback = cb;
    return mockChannel;
  }),
};
const mockSupabaseClient = {
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
};
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabaseClient,
}));

beforeEach(() => {
  mockGetPickTracker.mockReset();
  subscribeCallback = null;
  mockChannel.subscribe.mockClear();
  // Without this, mock.calls accumulates across tests and mock.calls[0] in a later test
  // resolves to a handler bound to an earlier, already-unmounted test's component —
  // calling it there silently no-ops instead of failing loudly, which is exactly what
  // happened before this reset was added (see PIC-14 session notes).
  mockChannel.on.mockClear();
});

const WEEK_DRAFT = { id: "week-1", week_number: 1, state: "draft" as const, closed_at: null };
const WEEK_PUBLISHED = { id: "week-1", week_number: 1, state: "published" as const, closed_at: null };
const GAME = {
  id: "game-1",
  week_id: "week-1",
  away_team: "NE",
  home_team: "SEA",
  spread: -3,
  kickoff_at: "2026-09-10T17:00:00Z",
  status: "scheduled" as const,
  home_score: null,
  away_score: null,
};
const ROSTER = [{ id: "roster-1", display_name: "Dev GM", email: "dev-gm@pickemv2.test" }];

describe("PickTracker (CT5)", () => {
  it("Given the initial snapshot fails to load, When rendered, Then it shows the error state with Retry", async () => {
    mockGetPickTracker.mockResolvedValue(null);

    render(<PickTracker />);

    expect(await screen.findByText(/couldn't load the pick tracker/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Given the week hasn't been published yet, When rendered, Then it shows the not-published empty state, not the no-picks one", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_DRAFT, games: [GAME], roster: ROSTER, picks: [] });

    render(<PickTracker />);

    expect(await screen.findByText(/hasn't been published yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no picks have come in yet/i)).not.toBeInTheDocument();
  });

  it("Given a published week with zero picks submitted, When rendered, Then it shows the distinct no-picks empty state", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [] });

    render(<PickTracker />);

    expect(await screen.findByText(/no picks have come in yet/i)).toBeInTheDocument();
  });

  it("Given a published week with a submitted pick, When rendered, Then it shows the GM's name and pick value in the grid", async () => {
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME],
      roster: ROSTER,
      picks: [{ game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" }],
    });

    render(<PickTracker />);

    expect(await screen.findByText("Dev GM")).toBeInTheDocument();
    expect(screen.getByText("SEA")).toBeInTheDocument();
  });

  it("Given a GM with no pick on a game, When rendered, Then the cell shows an en-dash rather than blank", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [] });
    // Force the loaded state (not the empty-no-picks state) by adding a second game with a
    // pick, so the no-pick cell for GAME is what's actually under test.
    const secondGame = { ...GAME, id: "game-2", away_team: "BUF", home_team: "HOU" };
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME, secondGame],
      roster: ROSTER,
      picks: [{ game_id: "game-2", roster_id: "roster-1", pick_value: "HOU", pick_status: "submitted" }],
    });

    render(<PickTracker />);

    await screen.findByText("HOU");
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("Given the realtime channel drops after connecting, When it reports CHANNEL_ERROR, Then the reconnect banner appears, and it clears once SUBSCRIBED fires again", async () => {
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME],
      roster: ROSTER,
      picks: [{ game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" }],
    });

    render(<PickTracker />);
    await screen.findByText("SEA");

    await waitFor(() => expect(subscribeCallback).not.toBeNull());
    subscribeCallback!("SUBSCRIBED");
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();

    subscribeCallback!("CHANNEL_ERROR");
    expect(await screen.findByText(/live updates paused/i)).toBeInTheDocument();

    subscribeCallback!("SUBSCRIBED");
    await waitFor(() => expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument());
  });

  it("Given a live INSERT event for a game with no prior pick, When it arrives, Then the cell updates without a manual reload", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [] });

    render(<PickTracker />);
    await screen.findByText(/no picks have come in yet/i);

    await waitFor(() => expect(mockChannel.on).toHaveBeenCalled());
    const onHandler = mockChannel.on.mock.calls[0][2] as (payload: unknown) => void;
    onHandler({
      eventType: "INSERT",
      new: { game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" },
    });

    expect(await screen.findByText("SEA")).toBeInTheDocument();
  });
});
