import { describe, it, expect } from "vitest";
import { formatGameDay, formatKickoffTime, formatHomeSpread } from "./format";

describe("formatGameDay (PIC-19)", () => {
  it("Given a Thursday kickoff, When formatted, Then it returns a 3-letter uppercase day", () => {
    // 2026-09-10 is a Thursday.
    expect(formatGameDay("2026-09-10T17:00:00Z")).toBe("THU");
  });

  it("Given a Sunday kickoff, When formatted, Then it returns SUN", () => {
    // 2026-09-13 is a Sunday.
    expect(formatGameDay("2026-09-13T17:00:00Z")).toBe("SUN");
  });
});

describe("formatKickoffTime (PIC-19)", () => {
  it("Given a kickoff time, When formatted, Then it returns a locale time string with hour and minute", () => {
    const result = formatKickoffTime("2026-09-10T17:00:00Z");
    // Exact rendering depends on the runner's locale/timezone, but it must always include
    // a colon-separated hour:minute — this is what actually matters for the AC (kickoff
    // time visible as its own field), not a specific timezone.
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatHomeSpread (PIC-19)", () => {
  it("Given no spread set, When formatted, Then it shows an em dash, not a numeric default", () => {
    expect(formatHomeSpread(null)).toBe("—");
  });

  it("Given a positive spread (home team is the underdog), When formatted, Then it shows an explicit + sign", () => {
    expect(formatHomeSpread(7.5)).toBe("+7.5");
  });

  it("Given a negative spread (home team is favored), When formatted, Then it shows the sign JS already gives negative numbers, not double-signed", () => {
    expect(formatHomeSpread(-3)).toBe("-3");
  });

  it("Given a pick'em (spread of exactly 0), When formatted, Then it shows a bare 0, not +0", () => {
    expect(formatHomeSpread(0)).toBe("0");
  });
});
