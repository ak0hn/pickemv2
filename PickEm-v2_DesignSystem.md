# PickEm v2 — Design System & Mobile Standards

> Standing reference, not a per-ticket checklist. Every epic and ticket inherits these
> requirements by default — cite this doc once in Definition of Done, don't restate its
> contents per ticket. Update this doc itself when a standard changes; don't fork copies
> into individual PRDs.

## Why this exists
PickEm v2 is a mobile-first PWA — most real usage is a GM on their phone checking/
submitting picks, not a desktop user. A design system ported from v1 without mobile
verification produced a top nav bar that overflowed and required horizontal scrolling —
caught only because Alex checked DevTools responsive mode directly (Aug 2, 2026). This
doc exists so that check happens by default, not by luck.

## Primary breakpoint
**Build and verify at 375px width first**, not desktop. 375px (iPhone SE) is the floor —
if it works there, it works on every larger phone. Secondary checks: 390px (iPhone 14),
768px (tablet/desktop, lower priority for beta).

When testing in Chrome DevTools, enable the device toolbar and turn on **Show device
frame → Include safe areas** to simulate notch and home-indicator insets. Skipping this
hides an entire class of real-device layout bugs.

## Navigation
- Bottom-fixed tab bar, not top. Standard mobile/PWA convention — thumb-reachable,
  doesn't compete with page content for horizontal space.
- Max 5 items, icon + short label, no horizontal scroll ever. If a 6th nav item is ever
  needed, that's a signal to consolidate, not to scroll.
- Nav item visibility can be role-gated (e.g. Commish Tools hidden for GM personas) but
  the bar itself never reflows/scrolls based on visible item count.
- **Thumb reach**: this is a bottom-nav app — page-level primary actions (submit picks,
  confirm settings) belong in the lower portion of the viewport, not top-aligned. The top
  quarter of the screen is the hardest reach zone when a phone is held in one hand. Design
  page layouts accordingly: leads at top, actions at bottom.

## Safe-area insets
**Required on every build, not optional.** iPhones with a home indicator (iPhone X through
current models — the majority of real users) expose a `safe-area-inset-bottom` of ~34px.
Without it, the bottom tab bar overlaps the system home indicator on real devices.

Two things must both be true:

1. `app/layout.tsx` must export a Next.js `viewport` config with `viewportFit: 'cover'` —
   without this, `env(safe-area-inset-bottom)` resolves to 0 everywhere, silently.
2. The nav bar must add `padding-bottom: env(safe-area-inset-bottom)`. Page content must
   use a bottom offset that accounts for nav height *plus* safe-area inset — not a
   hardcoded pixel value.

Any floating element positioned above the nav (e.g. dev tools FAB) must derive its bottom
offset from the nav's total rendered height, not a hardcoded pixel value. A hardcoded
offset that works at 375px today will clip the FAB on a notched phone once safe-area
insets are correctly applied.

## Touch targets
Minimum 44×44pt (Apple HIG) / 48×48dp (Material) for anything tappable — buttons, nav
items, pick selections, form controls. Don't shrink below this to fit more on screen; fix
the layout instead.

## Form inputs & keyboard
Input font size must be at least **16px**. iOS Safari auto-zooms the viewport when a
focused input has a smaller font size — this is a disruptive, uncorrectable layout shift
on a PWA. Set the size via token or global input style, not as a per-form override that
gets forgotten. This applies to any text input, search field, or score entry field in
commissioner tools.

## Components
- Use `components/ui/*` (shadcn "new-york" style, ported from v1) — don't hand-roll a
  one-off styled element when an existing component covers it.
- Dark theme only, tokens defined in `app/globals.css`. No light-mode variant planned for
  beta.
- Fonts: Archivo Black (display/headings), Inter (body), JetBrains Mono (numeric/mono
  contexts) — already wired via `next/font/google` in `app/layout.tsx`.

## Overflow & truncation
- No horizontal scroll on core layout chrome (nav, headers, page titles). If content
  doesn't fit, truncate with ellipsis or wrap — never let the container scroll sideways.
- Dropdowns/selects must show enough of their value to be legible at 375px, not just at
  desktop widths.

## Empty, loading & error states
Every view that fetches data needs designed treatments for three states:

- **Loading** — skeleton or spinner while data is in flight
- **Empty** — no games this week, no picks submitted yet, first-use onboarding context
- **Error** — fetch failure, deadline passed, permission denied

These are design deliverables, not ENG afterthoughts. Each epic's design scope must name
which states need treatment. A feature shipped with unstyled flash-of-empty or raw error
text is not QA-ready.

## Dev-only tooling
Dev/QA tooling (persona switcher, time-travel clock) must not compete with real product
UI for permanent screen space, especially the bottom nav bar. Collapse dev tools into a
floating trigger (FAB) that expands on demand, not a persistent full-width bar.

## Enforcement
- Every UI/UX ticket's Definition of Done includes: "Verified at 375px, no horizontal
  scroll, safe-area insets applied, nav unaffected." Tickets link here — they don't
  re-describe the rules.
- **E4 (code review)**: the code-reviewer agent is the first automated backstop. Any
  UI/UX ticket touching layout chrome, nav, or inputs should be checked against this doc
  at E4. Hard violations (missing safe-area, touch targets below minimums, input font
  below 16px) should block the review.
- **E6 (epic E2E)**: the qa-reviewer authors the E6 scenario at planning time. For any
  epic that touches nav or page layout, the E6 scenario must include a 375px viewport
  step. The qa-reviewer should reference this doc when writing those scenarios.
- **E7 (Alex's QA moment)**: Alex's assembled-epic spot-check is the human backstop for
  UX judgment — feel, copy, and real-world scenarios the spec didn't anticipate.
- **Acknowledged gap**: the `design-reviewer` agent (R1) reviews PRDs for designability,
  not rendered UI. There is currently no agent that reviews built screens against these
  standards. E4 and E6 are the practical mitigations until that's extended.
