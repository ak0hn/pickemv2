// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { PickTracker } from "./PickTracker";
import type { ReactNode } from "react";

afterEach(cleanup);

// Same lucide-react stand-in as PostComposer.test.tsx (PIC-11) — the barrel export hangs
// this project's vitest 4.1.11 + jsdom combination, and the icon carries no behavior
// these tests need to verify.
vi.mock("lucide-react", () => ({
  Lock: () => <span data-testid="icon-lock" />,
}));

// Same Sheet stand-in as PostComposer.test.tsx (PIC-11/PIC-15) — Radix's real Dialog
// primitive (which Sheet wraps) hangs indefinitely under this project's jsdom + vitest
// combination. What these tests need to verify is CT6's own correction logic (does
// tapping a cell open the sheet with the right current value, does Confirm call the RPC
// with the right args), not Radix's dialog mechanics. Includes the same synthetic
// dismiss button as PostComposer.test.tsx's mock (E4 finding — the first version of this
// mock omitted it, leaving the onOpenChange(false) path — backdrop tap/swipe/Escape in
// the real Sheet — untested).
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
  }) =>
    open ? (
      <div>
        {children}
        <button onClick={() => onOpenChange(false)}>Dismiss</button>
      </div>
    ) : null,
  SheetContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetFooter: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("@/lib/dev/DevProvider", () => ({
  useDev: () => ({ now: new Date("2026-09-10T12:00:00Z") }),
}));

const mockGetPickTracker = vi.fn();
const mockApplyPickCorrection = vi.fn();
vi.mock("@/lib/tracker/actions", () => ({
  getPickTrackerAction: () => mockGetPickTracker(),
  applyPickCorrection: (...args: unknown[]) => mockApplyPickCorrection(...args),
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
  mockApplyPickCorrection.mockReset();
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

  it("Given a game whose kickoff has already passed, When rendered, Then the header and cell show the lock icon, the cell gets the muted tint, and the pick value still shows (lock is an overlay, not a replacement)", async () => {
    // Mocked useDev().now is 2026-09-10T12:00:00Z — this kickoff is 2 hours before that.
    const lockedGame = { ...GAME, id: "game-locked", kickoff_at: "2026-09-10T10:00:00Z" };
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [lockedGame],
      roster: ROSTER,
      picks: [{ game_id: "game-locked", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" }],
    });

    render(<PickTracker />);

    const cell = await screen.findByText("SEA");
    // One lock icon in the column header, one overlaid on the cell.
    expect(screen.getAllByTestId("icon-lock")).toHaveLength(2);
    expect(cell.closest("button")).toHaveClass("bg-muted");
  });

  it("Given a game whose kickoff hasn't happened yet, When rendered, Then neither the header nor the cell show a lock icon", async () => {
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME], // kickoff_at 2026-09-10T17:00:00Z — after mocked now (12:00)
      roster: ROSTER,
      picks: [{ game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" }],
    });

    render(<PickTracker />);

    await screen.findByText("SEA");
    expect(screen.queryByTestId("icon-lock")).not.toBeInTheDocument();
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
    subscribeCallback!("SUBSCRIBED"); // first connect — follows load()'s own fetch, no refetch expected
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
    expect(mockGetPickTracker).toHaveBeenCalledTimes(1);

    subscribeCallback!("CHANNEL_ERROR");
    expect(await screen.findByText(/live updates paused/i)).toBeInTheDocument();

    subscribeCallback!("SUBSCRIBED"); // reconnect — must refetch, may have missed events while disconnected
    await waitFor(() => expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument());
    await waitFor(() => expect(mockGetPickTracker).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("SEA")).toBeInTheDocument();
  });

  it("Given a live event arrives while the week is still in draft state, When it arrives, Then the tracker escapes the empty-draft state the same way it escapes empty-no-picks", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_DRAFT, games: [GAME], roster: ROSTER, picks: [] });

    render(<PickTracker />);
    await screen.findByText(/hasn't been published yet/i);

    await waitFor(() => expect(mockChannel.on).toHaveBeenCalled());
    const onHandler = mockChannel.on.mock.calls[0][2] as (payload: unknown) => void;
    onHandler({
      eventType: "INSERT",
      new: { game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" },
    });

    expect(await screen.findByText("SEA")).toBeInTheDocument();
    expect(screen.queryByText(/hasn't been published yet/i)).not.toBeInTheDocument();
  });

  it("Given a live UPDATE event for a pick that already has a snapshot value, When it arrives, Then the cell reflects the new value, not the stale one", async () => {
    // pick_value uses the home team ("SEA"), which only ever appears in the header as
    // part of the compound "@SEA" text run — the away team ("NE") appears as an isolated
    // text node in the header too, which would make findByText("NE") ambiguous (matches
    // both the header and a cell showing "NE") if used as a pick value here.
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME],
      roster: ROSTER,
      picks: [{ game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" }],
    });

    render(<PickTracker />);
    const cell = await screen.findByRole("button");
    expect(cell).toHaveTextContent("SEA");

    await waitFor(() => expect(mockChannel.on).toHaveBeenCalled());
    const onHandler = mockChannel.on.mock.calls[0][2] as (payload: unknown) => void;
    onHandler({
      eventType: "UPDATE",
      new: { game_id: "game-1", roster_id: "roster-1", pick_value: "voided-marker", pick_status: "submitted" },
    });

    await waitFor(() => expect(cell).toHaveTextContent("voided-marker"));
    expect(cell).not.toHaveTextContent("SEA");
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

describe("Pick correction (CT6)", () => {
  const PICKED = { game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "submitted" as const };

  it("Given a cell with a submitted pick, When tapped, Then the correction sheet opens showing the GM, matchup, and current pick", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [PICKED] });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);

    // Scoped to the heading, not screen-wide — "Dev GM" also appears in the grid's own
    // sticky name column, which stays in the DOM behind the sheet (mocked Sheet doesn't
    // unmount siblings the way a real modal/portal would).
    expect(await screen.findByRole("heading", { name: /Dev GM.*NE @ SEA/ })).toBeInTheDocument();
    expect(screen.getByText(/Current pick:/)).toBeInTheDocument();
  });

  it("Given a cell with no prior pick, When opened and no team is selected, Then Confirm correction is disabled", async () => {
    const secondGame = { ...GAME, id: "game-2", away_team: "BUF", home_team: "HOU" };
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME, secondGame],
      roster: ROSTER,
      picks: [{ game_id: "game-2", roster_id: "roster-1", pick_value: "HOU", pick_status: "submitted" }],
    });

    render(<PickTracker />);
    const cells = await screen.findAllByTitle(/correct dev gm's pick/i);
    fireEvent.click(cells[0]); // the no-pick cell (game-1)

    const confirmButton = await screen.findByRole("button", { name: /confirm correction/i });
    expect(confirmButton).toBeDisabled();
  });

  it("Given a cell with no prior pick (a roster member who never submitted), When a team is selected and confirmed, Then applyPickCorrection is called — the insert/upsert path, not just correcting an existing value", async () => {
    const secondGame = { ...GAME, id: "game-2", away_team: "BUF", home_team: "HOU" };
    mockGetPickTracker.mockResolvedValue({
      week: WEEK_PUBLISHED,
      games: [GAME, secondGame],
      roster: ROSTER,
      picks: [{ game_id: "game-2", roster_id: "roster-1", pick_value: "HOU", pick_status: "submitted" }],
    });
    mockApplyPickCorrection.mockResolvedValue({ ok: true });

    render(<PickTracker />);
    const cells = await screen.findAllByTitle(/correct dev gm's pick/i);
    fireEvent.click(cells[0]); // the no-pick cell (game-1)

    await screen.findByText(/Current pick:\s*—/);
    fireEvent.click(screen.getByRole("button", { name: "SEA" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm correction/i }));

    await waitFor(() =>
      expect(mockApplyPickCorrection).toHaveBeenCalledWith({
        gameId: "game-1",
        rosterId: "roster-1",
        pickValue: "SEA",
      })
    );
  });

  it("Given a team is selected, When Confirm correction is tapped, Then applyPickCorrection is called with the game, roster, and chosen team, and the sheet closes on success", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [PICKED] });
    mockApplyPickCorrection.mockResolvedValue({ ok: true });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);

    const awayButton = await screen.findByRole("button", { name: "NE" });
    fireEvent.click(awayButton);
    fireEvent.click(screen.getByRole("button", { name: /confirm correction/i }));

    await waitFor(() =>
      expect(mockApplyPickCorrection).toHaveBeenCalledWith({
        gameId: "game-1",
        rosterId: "roster-1",
        pickValue: "NE",
      })
    );
    await waitFor(() => expect(screen.queryByText(/Current pick:/)).not.toBeInTheDocument());
  });

  it("Given the correction fails, When Confirm correction is tapped, Then the RPC's real error message is shown and the sheet stays open", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [PICKED] });
    mockApplyPickCorrection.mockResolvedValue({ ok: false, error: "Only the commissioner can correct a pick" });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole("button", { name: /confirm correction/i }));

    expect(await screen.findByText("Only the commissioner can correct a pick")).toBeInTheDocument();
    expect(screen.getByText(/Current pick:/)).toBeInTheDocument();
  });

  it("Given the correction sheet is open, When Cancel is tapped, Then applyPickCorrection is never called", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [PICKED] });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);
    await screen.findByText(/Current pick:/);

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/Current pick:/)).not.toBeInTheDocument());
    expect(mockApplyPickCorrection).not.toHaveBeenCalled();
  });

  it("Given the correction sheet is open, When dismissed without Cancel (backdrop/swipe/Escape in the real Sheet), Then applyPickCorrection is never called", async () => {
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [PICKED] });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);
    await screen.findByText(/Current pick:/);

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() => expect(screen.queryByText(/Current pick:/)).not.toBeInTheDocument());
    expect(mockApplyPickCorrection).not.toHaveBeenCalled();
  });

  it("Given a cell whose pick is already scored (game final), When corrected, Then applyPickCorrection is still called with the new value — AC: correction works even after locked/scored", async () => {
    const scoredPick = { game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "scored" as const };
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [scoredPick] });
    mockApplyPickCorrection.mockResolvedValue({ ok: true });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);

    // Current pick reflects the scored value, same as any other pick.
    expect(await screen.findByText(/Current pick:\s*SEA/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "NE" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm correction/i }));

    await waitFor(() =>
      expect(mockApplyPickCorrection).toHaveBeenCalledWith({
        gameId: "game-1",
        rosterId: "roster-1",
        pickValue: "NE",
      })
    );
  });

  it("Given a cell whose pick was voided (e.g. by a spread edit), When opened, Then Current pick shows — rather than the stale voided value, and correcting it calls applyPickCorrection normally", async () => {
    const voidedPick = { game_id: "game-1", roster_id: "roster-1", pick_value: "SEA", pick_status: "voided" as const };
    mockGetPickTracker.mockResolvedValue({ week: WEEK_PUBLISHED, games: [GAME], roster: ROSTER, picks: [voidedPick] });
    mockApplyPickCorrection.mockResolvedValue({ ok: true });

    render(<PickTracker />);
    const cell = await screen.findByTitle(/correct dev gm's pick/i);
    fireEvent.click(cell);

    // The stale "SEA" value must not appear as the pre-selected/current pick — a voided
    // pick isn't a live pick, same reasoning as the grid cell showing an en-dash for it.
    // Asserting on the SEA button specifically (the voided pick's own stale value) is the
    // direct check; NE not being highlighted would be true either way and wouldn't catch
    // a regression that pre-selected the stale value (E4 precision note).
    expect(await screen.findByText(/Current pick:\s*—/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SEA" })).not.toHaveClass("bg-primary");

    fireEvent.click(screen.getByRole("button", { name: "SEA" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm correction/i }));

    await waitFor(() =>
      expect(mockApplyPickCorrection).toHaveBeenCalledWith({
        gameId: "game-1",
        rosterId: "roster-1",
        pickValue: "SEA",
      })
    );
  });
});
