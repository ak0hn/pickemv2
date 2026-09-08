// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { CommentThread } from "./CommentThread";
import type { Comment } from "@/lib/feed/comments-actions";

afterEach(cleanup);

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="icon-x" />,
}));

vi.mock("@/lib/dev/DevProvider", () => ({
  useDev: () => ({ clockTick: 0 }),
}));

const mockGetCommentThreadSummary = vi.fn();
const mockGetFullThread = vi.fn();
const mockAddComment = vi.fn();
const mockDeleteComment = vi.fn();
vi.mock("@/lib/feed/comments-actions", () => ({
  getCommentThreadSummary: (postId: string) => mockGetCommentThreadSummary(postId),
  getFullThread: (postId: string) => mockGetFullThread(postId),
  addComment: (postId: string, body: string) => mockAddComment(postId, body),
  deleteComment: (commentId: string) => mockDeleteComment(commentId),
}));

beforeEach(() => {
  mockGetCommentThreadSummary.mockReset();
  mockGetFullThread.mockReset();
  mockAddComment.mockReset();
  mockDeleteComment.mockReset();
});

const BASE_PROPS = { postId: "post-1", isCommissioner: false };

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    authorName: "Riley M.",
    body: "GLHF",
    createdAt: new Date().toISOString(),
    isOwn: false,
    ...overrides,
  };
}

describe("CommentThread (PIC-33, NF4/NF5/NF6)", () => {
  it("Given the thread hasn't loaded yet, Then a loading skeleton renders", () => {
    mockGetCommentThreadSummary.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<CommentThread {...BASE_PROPS} />);

    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it("Given the thread fails to load, Then the locked-copy inline error with Retry renders", async () => {
    mockGetCommentThreadSummary.mockRejectedValue(new Error("network blip"));
    render(<CommentThread {...BASE_PROPS} />);

    expect(await screen.findByText(/couldn't load comments\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("Given Retry is tapped after a load failure, Then the thread is fetched again", async () => {
    mockGetCommentThreadSummary
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({ count: 0, recent: [] });
    render(<CommentThread {...BASE_PROPS} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockGetCommentThreadSummary).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/couldn't load comments\./i)).not.toBeInTheDocument();
  });

  it("Given 3 or fewer comments, Then all are shown with no 'See all' link", async () => {
    mockGetCommentThreadSummary.mockResolvedValue({
      count: 2,
      recent: [comment({ id: "c1", body: "first" }), comment({ id: "c2", body: "second" })],
    });
    render(<CommentThread {...BASE_PROPS} />);

    expect(await screen.findByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.queryByText(/see all/i)).not.toBeInTheDocument();
  });

  it("Given more than 3 comments, Then only the 3 most recent show with a 'See all N comments' link above them", async () => {
    mockGetCommentThreadSummary.mockResolvedValue({
      count: 5,
      recent: [comment({ id: "c3" }), comment({ id: "c4" }), comment({ id: "c5" })],
    });
    render(<CommentThread {...BASE_PROPS} />);

    expect(await screen.findByText("See all 5 comments")).toBeInTheDocument();
  });

  it("Given 'See all N comments' is tapped, Then the full thread replaces the preview and the link disappears", async () => {
    mockGetCommentThreadSummary.mockResolvedValue({
      count: 5,
      recent: [comment({ id: "c3" }), comment({ id: "c4" }), comment({ id: "c5" })],
    });
    mockGetFullThread.mockResolvedValue([
      comment({ id: "c1", body: "oldest" }),
      comment({ id: "c2" }),
      comment({ id: "c3" }),
      comment({ id: "c4" }),
      comment({ id: "c5" }),
    ]);
    render(<CommentThread {...BASE_PROPS} />);

    fireEvent.click(await screen.findByText("See all 5 comments"));

    expect(await screen.findByText("oldest")).toBeInTheDocument();
    expect(mockGetFullThread).toHaveBeenCalledWith("post-1");
    expect(screen.queryByText(/see all/i)).not.toBeInTheDocument();
  });

  it("Given expanding the thread fails, Then a dedicated retry re-attempts the expand, not the summary load (E4 fix)", async () => {
    mockGetCommentThreadSummary.mockResolvedValue({
      count: 5,
      recent: [comment({ id: "c3" }), comment({ id: "c4" }), comment({ id: "c5" })],
    });
    mockGetFullThread
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce([
        comment({ id: "c1", body: "oldest" }),
        comment({ id: "c2" }),
        comment({ id: "c3" }),
        comment({ id: "c4" }),
        comment({ id: "c5" }),
      ]);
    render(<CommentThread {...BASE_PROPS} />);

    fireEvent.click(await screen.findByText("See all 5 comments"));
    expect(await screen.findByText(/couldn't load the full thread/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockGetFullThread).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("oldest")).toBeInTheDocument();
    // The summary fetch (load()) must not have been re-triggered by this retry.
    expect(mockGetCommentThreadSummary).toHaveBeenCalledTimes(1);
  });

  describe("NF5/NF6 — delete affordance and moderation", () => {
    it("Given a comment isn't the viewer's own and the viewer isn't commissioner, Then no delete button renders", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({
        count: 1,
        recent: [comment({ isOwn: false })],
      });
      render(<CommentThread {...BASE_PROPS} isCommissioner={false} />);

      await screen.findByText("GLHF");
      expect(screen.queryByRole("button", { name: /delete comment/i })).not.toBeInTheDocument();
    });

    it("Given the viewer is the comment's author, Then a delete button renders even for a GM viewer", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({
        count: 1,
        recent: [comment({ isOwn: true, authorName: "Casey B." })],
      });
      render(<CommentThread {...BASE_PROPS} isCommissioner={false} />);

      expect(await screen.findByRole("button", { name: /delete comment by casey b\./i })).toBeInTheDocument();
    });

    it("Given the viewer is commissioner, Then a delete button renders on someone else's comment too", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({
        count: 1,
        recent: [comment({ isOwn: false, authorName: "Drew H." })],
      });
      render(<CommentThread {...BASE_PROPS} isCommissioner />);

      expect(await screen.findByRole("button", { name: /delete comment by drew h\./i })).toBeInTheDocument();
    });

    it("Given a delete succeeds, Then deleteComment is called and the comment disappears", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({
        count: 1,
        recent: [comment({ id: "c1", isOwn: true })],
      });
      mockDeleteComment.mockResolvedValue(undefined);
      render(<CommentThread {...BASE_PROPS} />);

      fireEvent.click(await screen.findByRole("button", { name: /delete comment/i }));

      await waitFor(() => expect(mockDeleteComment).toHaveBeenCalledWith("c1"));
      await waitFor(() => expect(screen.queryByText("GLHF")).not.toBeInTheDocument());
    });

    it("Given the viewer is commissioner, When they delete someone else's comment, Then it disappears for good (NF6 end-to-end)", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({
        count: 1,
        recent: [comment({ id: "c1", isOwn: false, authorName: "Drew H." })],
      });
      mockDeleteComment.mockResolvedValue(undefined);
      render(<CommentThread {...BASE_PROPS} isCommissioner />);

      fireEvent.click(await screen.findByRole("button", { name: /delete comment by drew h\./i }));

      await waitFor(() => expect(mockDeleteComment).toHaveBeenCalledWith("c1"));
      await waitFor(() => expect(screen.queryByText("GLHF")).not.toBeInTheDocument());
    });

    it("Given a delete fails, Then an inline error with Try again renders on that row, and retrying calls deleteComment again", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({
        count: 1,
        recent: [comment({ id: "c1", isOwn: true })],
      });
      mockDeleteComment.mockRejectedValueOnce(new Error("couldn't delete")).mockResolvedValueOnce(undefined);
      render(<CommentThread {...BASE_PROPS} />);

      fireEvent.click(await screen.findByRole("button", { name: /delete comment/i }));
      expect(await screen.findByText("couldn't delete")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      await waitFor(() => expect(mockDeleteComment).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText("GLHF")).not.toBeInTheDocument());
    });
  });

  describe("NF4 — composer", () => {
    it("Given the composer is empty, Then the Post button is disabled", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({ count: 0, recent: [] });
      render(<CommentThread {...BASE_PROPS} />);

      await waitFor(() => expect(mockGetCommentThreadSummary).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    });

    it("Given text is typed and Post is tapped, Then addComment is called and the new comment appends to the list", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({ count: 0, recent: [] });
      mockAddComment.mockResolvedValue(
        comment({ id: "new-1", authorName: "Quinn A.", body: "nice pick", isOwn: true }),
      );
      render(<CommentThread {...BASE_PROPS} />);
      await waitFor(() => expect(mockGetCommentThreadSummary).toHaveBeenCalled());

      fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
        target: { value: "nice pick" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Post" }));

      await waitFor(() => expect(mockAddComment).toHaveBeenCalledWith("post-1", "nice pick"));
      expect(await screen.findByText("nice pick")).toBeInTheDocument();
      // Input clears after a successful post.
      expect(screen.getByPlaceholderText("Add a comment…")).toHaveValue("");
    });

    it("Given Enter is pressed in the composer, Then it submits the same as tapping Post", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({ count: 0, recent: [] });
      mockAddComment.mockResolvedValue(comment({ id: "new-1", body: "via enter" }));
      render(<CommentThread {...BASE_PROPS} />);
      await waitFor(() => expect(mockGetCommentThreadSummary).toHaveBeenCalled());

      const input = screen.getByPlaceholderText("Add a comment…");
      fireEvent.change(input, { target: { value: "via enter" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => expect(mockAddComment).toHaveBeenCalledWith("post-1", "via enter"));
    });

    it("Given Enter is pressed twice in rapid succession, Then addComment is called only once (E4 double-submit fix)", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({ count: 0, recent: [] });
      let resolveAdd: (c: Comment) => void;
      mockAddComment.mockReturnValue(new Promise<Comment>((resolve) => (resolveAdd = resolve)));
      render(<CommentThread {...BASE_PROPS} />);
      await waitFor(() => expect(mockGetCommentThreadSummary).toHaveBeenCalled());

      const input = screen.getByPlaceholderText("Add a comment…");
      fireEvent.change(input, { target: { value: "double tap" } });
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockAddComment).toHaveBeenCalledTimes(1);
      resolveAdd!(comment({ id: "new-1", body: "double tap" }));
      await screen.findByText("double tap");
    });

    it("Given a submission fails, Then an inline error with Try again renders and resubmits on retry", async () => {
      mockGetCommentThreadSummary.mockResolvedValue({ count: 0, recent: [] });
      mockAddComment
        .mockRejectedValueOnce(new Error("couldn't post"))
        .mockResolvedValueOnce(comment({ id: "new-1", body: "retry text" }));
      render(<CommentThread {...BASE_PROPS} />);
      await waitFor(() => expect(mockGetCommentThreadSummary).toHaveBeenCalled());

      fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
        target: { value: "retry text" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Post" }));

      expect(await screen.findByText("couldn't post")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      await waitFor(() => expect(mockAddComment).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("retry text")).toBeInTheDocument();
    });
  });
});
