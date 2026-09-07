import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./format";

const NOW = new Date("2026-09-07T12:00:00Z");

describe("formatRelativeTime (PIC-31)", () => {
  it("Given a timestamp under a minute old, When formatted, Then it returns 'just now'", () => {
    expect(formatRelativeTime("2026-09-07T11:59:30Z", NOW)).toBe("just now");
  });

  it("Given a timestamp a few minutes old, When formatted, Then it returns compact minutes", () => {
    expect(formatRelativeTime("2026-09-07T11:55:00Z", NOW)).toBe("5m ago");
  });

  it("Given a timestamp a few hours old, When formatted, Then it returns compact hours", () => {
    expect(formatRelativeTime("2026-09-07T09:00:00Z", NOW)).toBe("3h ago");
  });

  it("Given a timestamp a few days old, When formatted, Then it returns compact days", () => {
    expect(formatRelativeTime("2026-09-04T12:00:00Z", NOW)).toBe("3d ago");
  });

  it("Given a timestamp over a week old, When formatted, Then it falls back to a real date", () => {
    expect(formatRelativeTime("2026-08-20T12:00:00Z", NOW)).toBe("Aug 20");
  });

  it("Given no explicit `now`, When formatted, Then it still returns a string without throwing", () => {
    expect(typeof formatRelativeTime(new Date().toISOString())).toBe("string");
  });
});
