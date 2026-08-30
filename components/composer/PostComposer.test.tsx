// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@/lib/test-utils/extend-matchers";
import { PostComposer } from "./PostComposer";
import type { ReactNode } from "react";

afterEach(cleanup);

vi.mock("@/lib/posts/actions", () => ({
  uploadPostImage: vi.fn(),
}));

// lucide-react's icon barrel export hangs Vite's dependency pre-bundler under this
// project's vitest 4.1.11 + jsdom combination — reproduced and isolated during PIC-11
// down to `import { ImagePlus, X } from "lucide-react"` alone (nothing else). Real app
// code (dev server, build) is unaffected — this is test-tooling-specific. Icons carry no
// behavior these tests need to verify, so a trivial stand-in sidesteps it.
vi.mock("lucide-react", () => ({
  ImagePlus: () => <span data-testid="icon-image-plus" />,
  X: () => <span data-testid="icon-x" />,
}));

// Radix's real Dialog primitive (which Sheet wraps) hangs indefinitely under this
// project's jsdom + vitest 4.1.11 combination — reproduced and isolated during PIC-11
// down to the bare primitive itself (portal/scroll-lock/focus-trap machinery), not
// anything in this app's own code. What these tests actually need to verify is
// PostComposer's own logic (does Cancel skip onConfirm, does a rejected onConfirm keep
// the sheet open and show the error) — not Radix's dialog mechanics, which are Radix's
// own responsibility. A minimal stand-in that mirrors the real Sheet's open/onOpenChange
// contract exercises that logic without depending on the primitive that hangs.
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
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
  SheetContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PostComposer (CT17 AC2 — cancel must not silently complete the triggering action)", () => {
  it("Given the composer is open, When Cancel is clicked, Then onConfirm is never called", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <PostComposer
        open
        onOpenChange={onOpenChange}
        trigger="freeform"
        block={null}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Given the composer is closed via the sheet's own dismiss (backdrop/X), When that happens, Then onConfirm is also never called", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <PostComposer
        open
        onOpenChange={onOpenChange}
        trigger="freeform"
        block={null}
        onConfirm={onConfirm}
      />
    );

    // Radix's default close button, rendered by SheetContent itself.
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Given Post is clicked, When onConfirm resolves, Then it's called exactly once with the typed message", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <PostComposer
        open
        onOpenChange={vi.fn()}
        trigger="freeform"
        block={null}
        onConfirm={onConfirm}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/write a post/i), {
      target: { value: "Good luck this week" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^post$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith("Good luck this week", null);
  });

  it("Given onConfirm rejects, When Post is clicked, Then the composer stays open and the error is shown (not silently swallowed)", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("2 games still need a spread"));
    const onOpenChange = vi.fn();

    render(
      <PostComposer
        open
        onOpenChange={onOpenChange}
        trigger="open_week"
        block={{ type: "open_week", weekNumber: 1, games: [] }}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^post$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/still need a spread/i);
    // The sheet was never told to close on failure.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("PostComposer block rendering (CT17 — all four trigger variants)", () => {
  it("Given an open_week block, When rendered, Then it's read-only (no input controls inside the block itself)", () => {
    render(
      <PostComposer
        open
        onOpenChange={vi.fn()}
        trigger="open_week"
        block={{
          type: "open_week",
          weekNumber: 4,
          games: [{ away: "NYJ", home: "BUF", spread: -6.5, kickoffLabel: "Thu 8:20 PM ET" }],
        }}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("Week 4 Slate")).toBeInTheDocument();
    expect(screen.getByText(/NYJ @ BUF/)).toBeInTheDocument();
    // Only the message textarea and the (hidden, native) file input should be editable —
    // nothing inside the block itself renders as an input/textarea.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("Given a freeform trigger, When rendered, Then no block is shown at all", () => {
    render(
      <PostComposer
        open
        onOpenChange={vi.fn()}
        trigger="freeform"
        block={null}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByText(/Slate$/)).not.toBeInTheDocument();
  });
});
