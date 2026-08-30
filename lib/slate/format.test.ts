import { describe, it, expect } from "vitest";
import { formatGameDay, formatKickoffTime, formatHomeSpread } from "./format";

describe("formatGameDay (PIC-19)", () => {
  it("Given a Thursday kickoff (ET), When formatted, Then it returns a 3-letter uppercase day", () => {
    // 2026-09-10T17:00:00Z is 1:00 PM EDT the same calendar day — still Thursday.
    expect(formatGameDay("2026-09-10T17:00:00Z")).toBe("THU");
  });

  it("Given a Sunday kickoff (ET), When formatted, Then it returns SUN", () => {
    // 2026-09-13T17:00:00Z is 1:00 PM EDT the same calendar day — still Sunday.
    expect(formatGameDay("2026-09-13T17:00:00Z")).toBe("SUN");
  });

  it("Given a UTC timestamp that crosses into the next calendar day outside ET, When formatted, Then it still resolves to the ET day, not the runner's local day", () => {
    // 2026-09-11T02:00:00Z is 10:00 PM EDT on Sept 10 (Thursday) — but in UTC+7 or later,
    // this same instant is already Sept 11 (Friday). Pinning to America/New_York (the E4
    // fix) means this must resolve to THU regardless of what timezone the test runner is
    // in — this is the exact case that was flaky before the timezone was pinned.
    expect(formatGameDay("2026-09-11T02:00:00Z")).toBe("THU");
  });
});

describe("formatKickoffTime (PIC-19)", () => {
  it("Given a kickoff time, When formatted, Then it returns the ET time with hour, minute, and timezone label", () => {
    // Deterministic now that timezone is pinned (E4 fix) — regardless of the runner's own
    // local timezone, this must always resolve to 1:00 PM EDT.
    expect(formatKickoffTime("2026-09-10T17:00:00Z")).toBe("1:00 PM EDT");
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

  it("Given a pick'em (spread of exactly 0), When formatted, Then it shows PK per sports convention, not a bare 0 or +0", () => {
    expect(formatHomeSpread(0)).toBe("PK");
  });
});
