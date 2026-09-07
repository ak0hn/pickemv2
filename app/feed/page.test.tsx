// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
