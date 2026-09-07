// @vitest-environment jsdom
// Regression suite for the shared PostBlockContent component.
// context="feed" is exercised by PostCard.test.tsx (PostCard always passes "feed").
// This file specifically pins the context="preview" branch so a future refactor to the
// conditional at line 85 of PostBlockContent.tsx can't silently break the composer sheet.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { PostBlockContent } from "./PostBlockContent";

afterEach(cleanup);

const CLOSE_WEEK_BLOCK = {
  type: "close_week" as const,
  weekNumber: 3,
  games: [{ away: "NE", home: "SEA", spread: -3, kickoffLabel: "Thu 8:20 PM ET", winner: "home" as const }],
  standings: [{ name: "Jordan P.", wins: 5, losses: 2, pushes: 0 }],
};

describe("PostBlockContent — context=preview (composer regression)", () => {
  it('Given a close_week block in preview context, Then "(see full)" link renders and points to /league', () => {
    render(<PostBlockContent block={CLOSE_WEEK_BLOCK} context="preview" />);

    const seeFullLink = screen.getByRole("link", { name: "(see full)" });
    expect(seeFullLink).toBeInTheDocument();
    expect(seeFullLink).toHaveAttribute("href", "/league");
  });

  it("Given a close_week block in feed context, Then no (see full) link renders", () => {
    render(<PostBlockContent block={CLOSE_WEEK_BLOCK} context="feed" />);

    expect(screen.queryByRole("link", { name: "(see full)" })).not.toBeInTheDocument();
  });

  it("Given a close_week block in preview context, Then the surface class is bg-card (not bg-surface-elevated)", () => {
    const { container } = render(<PostBlockContent block={CLOSE_WEEK_BLOCK} context="preview" />);

    const block = container.firstChild as HTMLElement;
    expect(block).toHaveClass("bg-card");
    expect(block).not.toHaveClass("bg-surface-elevated");
  });

  it("Given a close_week block in feed context, Then the surface class is bg-surface-elevated (not bg-card)", () => {
    const { container } = render(<PostBlockContent block={CLOSE_WEEK_BLOCK} context="feed" />);

    const block = container.firstChild as HTMLElement;
    expect(block).toHaveClass("bg-surface-elevated");
    expect(block).not.toHaveClass("bg-card");
  });
});
