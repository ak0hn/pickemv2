// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { ReactionControl } from "./ReactionControl";
import type { ReactNode } from "react";

afterEach(cleanup);

vi.mock("lucide-react", () => ({
  Heart: ({ className }: { className?: string }) => (
    <span data-testid="icon-heart" className={className} />
  ),
  X: () => <span data-testid="icon-x" />,
}));

// Radix's real Sheet/Dialog hangs jsdom under this project's vitest 4.1.11 combination
// (established during PIC-11) — same minimal stand-in pattern as PostComposer.test.tsx.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const mockGetReactors = vi.fn();
const mockDeleteReaction = vi.fn();
vi.mock("@/lib/feed/reactions-actions", () => ({
  getReactors: (postId: string) => mockGetReactors(postId),
  deleteReaction: (postId: string, rosterId: string) => mockDeleteReaction(postId, rosterId),
}));

const BASE_PROPS = { postId: "post-1", isCommissioner: false };

describe("ReactionControl (PIC-32, NF3)", () => {
  it("Given zero reactions and the viewer hasn't reacted, Then no count renders, only the outline heart", () => {
    render(<ReactionControl {...BASE_PROPS} count={0} viewerReacted={false} onToggle={vi.fn()} />);

    expect(screen.queryByText("0")).not.toBeInTheDocument();
    const icon = screen.getByTestId("icon-heart");
    expect(icon.className).not.toContain("fill-destructive");
  });

  it("Given N >= 1 reactions and the viewer hasn't reacted, Then the outline heart shows with the count", () => {
    render(<ReactionControl {...BASE_PROPS} count={4} viewerReacted={false} onToggle={vi.fn()} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    const icon = screen.getByTestId("icon-heart");
    expect(icon.className).not.toContain("fill-destructive");
  });

  it("Given the viewer has reacted, Then the heart is filled --destructive red with the count", () => {
    render(<ReactionControl {...BASE_PROPS} count={1} viewerReacted onToggle={vi.fn()} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    const icon = screen.getByTestId("icon-heart");
    expect(icon.className).toContain("fill-destructive");
    expect(icon.className).toContain("text-destructive");
  });

  it("Given the heart is tapped, Then onToggle fires exactly once", () => {
    const onToggle = vi.fn();
    render(<ReactionControl {...BASE_PROPS} count={0} viewerReacted={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: /like this post/i }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("Given the control is disabled (a toggle already in flight), Then the heart does not respond to a tap", () => {
    const onToggle = vi.fn();
    render(<ReactionControl {...BASE_PROPS} count={0} viewerReacted={false} onToggle={onToggle} disabled />);

    fireEvent.click(screen.getByRole("button", { name: /like this post/i }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  describe("NF6 — who-reacted sheet and commissioner moderation", () => {
    it("Given zero reactions, Then there is no count button to open the sheet at all", () => {
      render(<ReactionControl {...BASE_PROPS} count={0} viewerReacted={false} onToggle={vi.fn()} />);

      expect(screen.queryByRole("button", { name: /see who liked/i })).not.toBeInTheDocument();
    });

    it("Given a GM viewer taps the count, Then the sheet lists reactor names with no delete affordance", async () => {
      mockGetReactors.mockResolvedValue([{ rosterId: "roster-2", name: "Sam" }]);
      render(<ReactionControl {...BASE_PROPS} isCommissioner={false} count={1} viewerReacted={false} onToggle={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /see who liked/i }));

      expect(await screen.findByText("Sam")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /remove sam/i })).not.toBeInTheDocument();
    });

    it("Given a commissioner viewer taps the count, Then each reactor row has a remove button", async () => {
      mockGetReactors.mockResolvedValue([{ rosterId: "roster-2", name: "Sam" }]);
      render(<ReactionControl {...BASE_PROPS} isCommissioner count={1} viewerReacted={false} onToggle={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /see who liked/i }));

      expect(await screen.findByRole("button", { name: /remove sam/i })).toBeInTheDocument();
    });

    it("Given a commissioner removes a reactor, Then deleteReaction is called and that name disappears from the list", async () => {
      mockGetReactors.mockResolvedValue([
        { rosterId: "roster-2", name: "Sam" },
        { rosterId: "roster-3", name: "Jordan" },
      ]);
      mockDeleteReaction.mockResolvedValue(undefined);
      render(<ReactionControl {...BASE_PROPS} isCommissioner count={2} viewerReacted={false} onToggle={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /see who liked/i }));
      await screen.findByText("Sam");

      fireEvent.click(screen.getByRole("button", { name: /remove sam/i }));

      await waitFor(() => expect(mockDeleteReaction).toHaveBeenCalledWith("post-1", "roster-2"));
      await waitFor(() => expect(screen.queryByText("Sam")).not.toBeInTheDocument());
      expect(screen.getByText("Jordan")).toBeInTheDocument();
    });

    it("Given getReactors fails, Then the sheet shows an error instead of hanging on 'Loading…'", async () => {
      mockGetReactors.mockRejectedValue(new Error("network blip"));
      render(<ReactionControl {...BASE_PROPS} count={1} viewerReacted={false} onToggle={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /see who liked/i }));

      expect(await screen.findByText("network blip")).toBeInTheDocument();
    });
  });
});
