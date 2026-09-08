// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { PostCard } from "./PostCard";
import type { FeedPost } from "@/lib/posts/actions";

afterEach(cleanup);

// lucide-react's icon barrel export hangs Vite's dependency pre-bundler under this
// project's vitest 4.1.11 + jsdom combination (established during PIC-11, see
// PostComposer.test.tsx) — PostCard now transitively renders Heart via ReactionControl.
vi.mock("lucide-react", () => ({
  Heart: () => <span data-testid="icon-heart" />,
  X: () => <span data-testid="icon-x" />,
}));

// PIC-32: PostCard now reads persona.role itself (for ReactionControl's isCommissioner
// prop) rather than taking it from a caller-supplied prop — default to a GM viewer here;
// commissioner-specific behavior (deleting others' reactions) is exercised in
// ReactionControl.test.tsx, not re-tested at this layer.
vi.mock("@/lib/dev/DevProvider", () => ({
  useDev: () => ({ persona: { role: "gm" } }),
}));

// PIC-33: PostCard now always mounts a CommentThread, which fetches its own summary on
// mount — mocked to an empty thread here since comment behavior itself is exercised in
// CommentThread.test.tsx, not re-tested at this layer.
vi.mock("@/lib/feed/comments-actions", () => ({
  getCommentThreadSummary: vi.fn().mockResolvedValue({ count: 0, recent: [] }),
  getFullThread: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

const BASE: Omit<FeedPost, "trigger" | "block_data" | "message" | "image_url"> = {
  id: "post-1",
  author_roster_id: "roster-1",
  week_id: "week-1",
  created_at: new Date().toISOString(),
  authorName: "Jordan P.",
};

describe("PostCard (PIC-31)", () => {
  it("Given an open_week or close_week post, Then the card header shows which week it's about", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "open_week",
      message: "Lines are up.",
      image_url: null,
      block_data: { type: "open_week", weekNumber: 5, games: [] },
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    // Scoped to the header's own "· Week N" text specifically — the block's own "Week N
    // Slate"/"Week N Results" heading also matches a bare /Week 5/ query.
    expect(screen.getByText("· Week 5")).toBeInTheDocument();
  });

  it("Given a free-form post, Then the card header shows no week label", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "freeform",
      message: "GLHF everyone.",
      image_url: null,
      block_data: null,
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    expect(screen.queryByText(/Week \d/)).not.toBeInTheDocument();
  });

  it("NF1/NF10 — Given an open_week post, When rendered, Then it shows the real message and slate block, not a placeholder", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "open_week",
      message: "Lines are up — good luck this week!",
      image_url: null,
      block_data: {
        type: "open_week",
        weekNumber: 3,
        games: [{ away: "NE", home: "SEA", spread: -3, kickoffLabel: "Thu 8:20 PM ET" }],
      },
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    expect(screen.getByText("Lines are up — good luck this week!")).toBeInTheDocument();
    expect(screen.getByText("Week 3 Slate")).toBeInTheDocument();
    expect(screen.getByText(/NE @ SEA/)).toBeInTheDocument();
  });

  it("NF11 — Given an open_week post, Then its CTA links to /picks", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "open_week",
      message: "Week is open.",
      image_url: null,
      block_data: { type: "open_week", weekNumber: 3, games: [] },
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    const cta = screen.getByRole("link", { name: "Make your picks" });
    expect(cta).toHaveAttribute("href", "/picks");
  });

  it("NF12 — Given a close_week post, Then its two CTAs link to /picks?week=N and /league, and the block's own internal link is suppressed", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "close_week",
      message: "Week 3 is in the books.",
      image_url: null,
      block_data: {
        type: "close_week",
        weekNumber: 3,
        games: [{ away: "NE", home: "SEA", spread: -3, kickoffLabel: "Thu 8:20 PM ET", winner: "home" }],
        weeklyWinners: ["Jordan P."],
      },
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    expect(screen.getByRole("link", { name: "View my results" })).toHaveAttribute(
      "href",
      "/picks?week=3",
    );
    expect(screen.getByRole("link", { name: "View league results" })).toHaveAttribute(
      "href",
      "/league",
    );
    // The block's own "(see full)" link (rendered in composer-preview context) must not
    // appear in feed context — NF12's CTA above is the sole route to /league.
    expect(screen.queryByText("(see full)")).not.toBeInTheDocument();
  });

  it("NF13 — Given a free-form post, Then no CTA renders", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "freeform",
      message: "GLHF everyone.",
      image_url: null,
      block_data: null,
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /make|view|results/i }),
    ).not.toBeInTheDocument();
  });

  it("NF14 — Given an open_tiebreaker post, Then it renders its block content with no CTA and does not crash", () => {
    const post: FeedPost = {
      ...BASE,
      trigger: "open_tiebreaker",
      message: "Tiebreaker time.",
      image_url: null,
      block_data: {
        type: "open_tiebreaker",
        game: { away: "NYG", home: "LAR", spread: 2.5, kickoffLabel: "Mon 8:15 PM ET" },
      },
    };
    render(
      <PostCard
        post={post}
        reaction={{ count: 0, viewerReacted: false }}
        onToggleReaction={() => {}}
      />,
    );

    expect(screen.getByText("Tiebreaker: Monday Night Football")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /make|view|results/i }),
    ).not.toBeInTheDocument();
  });
});
