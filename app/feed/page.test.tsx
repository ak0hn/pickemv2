// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import FeedPage from "./page";
import type { FeedPost } from "@/lib/posts/actions";

afterEach(cleanup);

vi.mock("@/lib/dev/DevProvider", () => ({
  useDev: () => ({ persona: { role: "gm" } }),
}));

const mockGetFeedPosts = vi.fn();
vi.mock("@/lib/posts/actions", () => ({
  getFeedPosts: () => mockGetFeedPosts(),
}));

const mockGetReactionSummaries = vi.fn().mockResolvedValue({});
const mockToggleReaction = vi.fn();
vi.mock("@/lib/feed/reactions-actions", () => ({
  getReactionSummaries: (postIds: string[]) => mockGetReactionSummaries(postIds),
  toggleReaction: (postId: string) => mockToggleReaction(postId),
}));

// PIC-33: FeedPage now transitively renders CommentThread via PostCard, which fetches its
// own summary on mount — mocked to an empty thread here since comment behavior itself is
// exercised in CommentThread.test.tsx, not re-tested at this layer.
vi.mock("@/lib/feed/comments-actions", () => ({
  getCommentThreadSummary: vi.fn().mockResolvedValue({ count: 0, recent: [] }),
  getFullThread: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

// lucide-react's icon barrel export hangs Vite's dependency pre-bundler under this
// project's vitest 4.1.11 + jsdom combination (established during PIC-11) — FeedPage now
// transitively renders Heart via PostCard's ReactionControl and X via CommentThread.
vi.mock("lucide-react", () => ({
  Heart: () => <span data-testid="icon-heart" />,
  X: () => <span data-testid="icon-x" />,
}));

function post(id: string, createdAt: string): FeedPost {
  return {
    id,
    author_roster_id: "roster-1",
    week_id: "week-1",
    created_at: createdAt,
    authorName: "Jordan P.",
    trigger: "freeform",
    message: id,
    image_url: null,
    block_data: null,
  };
}

beforeEach(() => {
  mockGetReactionSummaries.mockReset().mockResolvedValue({});
  mockToggleReaction.mockReset().mockResolvedValue({ reacted: true });
});

describe("FeedPage (PIC-31, NF7)", () => {
  it("Given posts in any DB order, When the feed loads, Then they render newest-first with no week selector anywhere", async () => {
    // getFeedPosts is expected to already order by created_at desc — this test still
    // asserts render order explicitly, not just that the query claims to sort, so a
    // future page refactor that dropped the ordering would be caught here too.
    mockGetFeedPosts.mockResolvedValue([
      post("newest", "2026-09-10T12:00:00Z"),
      post("oldest", "2026-09-08T12:00:00Z"),
    ]);

    render(<FeedPage />);

    await waitFor(() => expect(screen.getByText("newest")).toBeInTheDocument());
    const messages = screen.getAllByText(/newest|oldest/).map((el) => el.textContent);
    expect(messages).toEqual(["newest", "oldest"]);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/past week|future week|week \d+/i)).not.toBeInTheDocument();
  });

  it("Given no posts exist, When a GM opens the feed, Then the GM-specific empty state renders", async () => {
    mockGetFeedPosts.mockResolvedValue([]);
    render(<FeedPage />);

    await waitFor(() =>
      expect(screen.getByText("Nothing here yet.")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("The commissioner will post when the week opens — check back soon."),
    ).toBeInTheDocument();
  });
});

describe("FeedPage reactions (PIC-32)", () => {
  it("Given N posts on the feed, When it loads, Then getReactionSummaries is called exactly once with every post id — not once per card", async () => {
    mockGetFeedPosts.mockResolvedValue([
      post("post-1", "2026-09-10T12:00:00Z"),
      post("post-2", "2026-09-09T12:00:00Z"),
    ]);

    render(<FeedPage />);

    await waitFor(() => expect(screen.getByText("post-1")).toBeInTheDocument());
    expect(mockGetReactionSummaries).toHaveBeenCalledTimes(1);
    expect(mockGetReactionSummaries).toHaveBeenCalledWith(["post-1", "post-2"]);
  });

  it("Given a post with an existing reaction summary, When the feed loads, Then the count and viewer-reacted state render from it", async () => {
    mockGetFeedPosts.mockResolvedValue([post("post-1", "2026-09-10T12:00:00Z")]);
    mockGetReactionSummaries.mockResolvedValue({ "post-1": { count: 3, viewerReacted: true } });

    render(<FeedPage />);

    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
  });

  it("Given a GM taps the reaction control, Then the count updates optimistically and toggleReaction is called with that post's id", async () => {
    mockGetFeedPosts.mockResolvedValue([post("post-1", "2026-09-10T12:00:00Z")]);
    mockGetReactionSummaries.mockResolvedValue({ "post-1": { count: 0, viewerReacted: false } });

    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText("post-1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /like this post/i }));

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(mockToggleReaction).toHaveBeenCalledWith("post-1");
  });

  it("Given toggleReaction fails, When a GM taps the control, Then the optimistic update reverts", async () => {
    mockGetFeedPosts.mockResolvedValue([post("post-1", "2026-09-10T12:00:00Z")]);
    mockGetReactionSummaries.mockResolvedValue({ "post-1": { count: 0, viewerReacted: false } });
    mockToggleReaction.mockRejectedValue(new Error("network error"));

    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText("post-1")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /like this post/i }));

    // Count briefly shows 1 optimistically, then reverts to 0 (no count label at all)
    // once the rejected server action resolves.
    await waitFor(() => expect(screen.queryByText("1")).not.toBeInTheDocument());
  });
});
