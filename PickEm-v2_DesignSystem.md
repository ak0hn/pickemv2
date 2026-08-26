# PickEm v2 — Design System & Mobile Standards

> **Status: CLEARED** — parallel review (Design / ENG / QA / Product) completed Aug 2,
> 2026. All 18 comment threads resolved and confirmed by their original authors; zero
> items required Alex's escalation. Review record: [Notion page](https://app.notion.com/p/3b0d4b15d22f815c8dbaefe8d08a2d4f).

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

**Orientation:** Portrait-only for beta. Landscape is not a supported orientation — epics
must not design or test for landscape layout. Beta scope deferral; landscape support is a
post-beta consideration.

## Navigation
- Bottom-fixed tab bar, not top. Standard mobile/PWA convention — thumb-reachable,
  doesn't compete with page content for horizontal space.
- Max 5 items, icon + short label, no horizontal scroll ever. If a 6th nav item is ever
  needed, that's a signal to consolidate, not to scroll.
- Nav item visibility can be role-gated (e.g. Commish Tools hidden for GM personas) but
  the bar itself never reflows/scrolls based on visible item count.
- **Thumb reach**: this is a bottom-nav app — page-level primary actions (submit picks,
  confirm settings) must be placed in a sticky bottom action bar or at/below the viewport
  midpoint at 375px. The top quarter of the screen is the hardest reach zone when a phone
  is held in one hand. Design page layouts accordingly: leads at top, actions at bottom.
  An action placed above the midpoint does not satisfy this rule regardless of proximity
  to the bottom.
- **Gestures**: none for beta. No pull-to-refresh, swipe-between-tabs, or swipe-to-act
  patterns are in scope. All interactions default to tap. Any gesture added to a specific
  epic must be explicitly specified in that epic's PRD before implementation.

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

**Implementation pattern (already shipped):** A `--nav-height` CSS custom property is
defined in `app/globals.css` and set dynamically by the layout. Page-level components
consume it via inline style: `style={{ paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom))' }}`.
This is the required pattern — do not use Tailwind arbitrary values (`pb-[env(...)]`), raw
CSS in component files, or a `@utility` definition. All epics must use this single
pattern.

Any element positioned above the nav (e.g. dev tools trigger) must derive its bottom
offset from `var(--nav-height)`, not a hardcoded pixel value. A hardcoded offset that
works at 375px today will clip on a notched phone once safe-area insets are correctly
applied.

## Touch targets
Minimum 44×44pt (Apple HIG) / 48×48dp (Material) for anything tappable — buttons, nav
items, pick selections, form controls. Don't shrink below this to fit more on screen; fix
the layout instead.

## Form inputs & keyboard
Input font size must be at least **16px**. iOS Safari auto-zooms the viewport when a
focused input has a smaller font size — this is a disruptive, uncorrectable layout shift
on a PWA. **Pre-epic-zero fix complete:** `components/ui/input.tsx` and
`components/ui/textarea.tsx` have had their `md:text-sm` downshift removed; `text-base`
(16px) now applies at every breakpoint. This is not a per-epic responsibility — the fix is
already in the base component. This applies to any text input, search field, or score
entry field in commissioner tools.

**System text scaling:** The app must respect iOS Dynamic Type and Android font scale. Do
not suppress or cap scaling via viewport meta or CSS (`-webkit-text-size-adjust: none`,
fixed `font-size` overrides). At 200%+ scale, bottom nav labels may wrap or overflow —
this is a known post-beta polish item, not a beta blocker. Epics must not introduce
fixed-height containers that clip text at large scale.

## Components
- Use `components/ui/*` (shadcn "new-york" style, ported from v1) — don't hand-roll a
  one-off styled element when an existing component covers it.
- Dark theme only for beta (scope deferral, not a permanent architecture decision). Token
  names in `app/globals.css` are semantic — they reflect role, not literal color values —
  so future theming or light-mode support does not require touching individual
  components.
- Fonts: Archivo Black (display/headings), Inter (body), JetBrains Mono (numeric/mono
  contexts) — already wired via `next/font/google` in `app/layout.tsx`.

**Semantic token reference** (all defined in `app/globals.css`). Use the token that
matches the semantic role — don't substitute a visually similar token because it "looks
right" in dark mode:

| Token | Intended role |
|---|---|
| `--background` | Page / app background |
| `--foreground` | Default body text |
| `--card` | Card / panel background |
| `--card-foreground` | Text on cards |
| `--popover` | Popover / dropdown background |
| `--popover-foreground` | Text in popovers |
| `--primary` | Primary interactive color (buttons, active states) |
| `--primary-foreground` | Text on primary-colored elements |
| `--secondary` | Secondary interactive color |
| `--secondary-foreground` | Text on secondary-colored elements |
| `--muted` | De-emphasized / secondary surface |
| `--muted-foreground` | Secondary / de-emphasized text |
| `--accent` | Accent highlight, hover states |
| `--accent-foreground` | Text on accent-colored elements |
| `--destructive` | Destructive actions, errors, danger states |
| `--destructive-foreground` | Text on destructive-colored elements |
| `--success` | Success states, confirmed picks |
| `--success-foreground` | Text on success-colored elements |
| `--warning` | Warning states, deadline proximity |
| `--warning-foreground` | Text on warning-colored elements |
| `--border` | Default border color |
| `--input` | Input field border / background |
| `--ring` | Focus ring |
| `--surface` | Base raised surface (slightly above background) |
| `--surface-elevated` | Further elevated panel (modals, sheets, tooltips) |

**Color values** (palette applied Aug 26, 2026)

This table maps every semantic token to its `oklch` value and the palette anchor it draws from. This is the single source of truth for the palette — sync `app/globals.css` to match whenever this table changes.

**Palette anchors**

| Color | Hex | oklch |
|---|---|---|
| Black | `#000000` | `oklch(0 0 0)` |
| Primary navy | `#1c0d53` | `oklch(0.239 0.117 282.9)` |
| Secondary / hover navy | `#2b147f` | `oklch(0.313 0.163 281.3)` |
| White | `#ffffff` | `oklch(1 0 0)` |
| Light neutral | `#dfe6e9` | `oklch(0.920 0.009 225.4)` |

**Token → value mapping**

| Token | oklch value | Hex anchor | Notes |
|---|---|---|---|
| `--background` | `oklch(0 0 0)` | `#000000` | App ground — palette: black |
| `--foreground` | `oklch(1 0 0)` | `#ffffff` | Primary text — palette: white |
| `--card` | `oklch(0.239 0.117 282.9)` | `#1c0d53` | Card / panel background — palette: primary navy |
| `--card-foreground` | `oklch(1 0 0)` | `#ffffff` | Text on cards |
| `--popover` | `oklch(0.313 0.163 281.3)` | `#2b147f` | Elevated above cards — palette: secondary navy |
| `--popover-foreground` | `oklch(1 0 0)` | `#ffffff` | Text in popovers |
| `--primary` | `oklch(0.239 0.117 282.9)` | `#1c0d53` | Buttons, active states — palette: primary navy |
| `--primary-foreground` | `oklch(1 0 0)` | `#ffffff` | Text on primary elements |
| `--secondary` | `oklch(0.313 0.163 281.3)` | `#2b147f` | Secondary actions — palette: secondary navy |
| `--secondary-foreground` | `oklch(1 0 0)` | `#ffffff` | Text on secondary elements |
| `--muted` | `oklch(0.135 0.040 283)` | derived | De-emphasized surface; darker than card, barely navy-tinted |
| `--muted-foreground` | `oklch(0.920 0.009 225.4)` | `#dfe6e9` | Secondary text — light neutral, softer than white, still 13.5:1 AAA on navy |
| `--accent` | `oklch(0.313 0.163 281.3)` | `#2b147f` | Hover / highlight — palette: secondary navy |
| `--accent-foreground` | `oklch(1 0 0)` | `#ffffff` | Text on accent elements |
| `--destructive` | `oklch(0.577 0.245 27.3)` | ~`#dc2626` | Retained semantic red — see judgment calls |
| `--destructive-foreground` | `oklch(1 0 0)` | `#ffffff` | |
| `--success` | `oklch(0.592 0.158 145.1)` | ~`#16a34a` | Retained semantic green |
| `--success-foreground` | `oklch(1 0 0)` | `#ffffff` | |
| `--warning` | `oklch(0.769 0.187 86.0)` | ~`#d97706` | Retained semantic amber |
| `--warning-foreground` | `oklch(0 0 0)` | `#000000` | Black on amber (7.7:1 AAA) — white would fail |
| `--border` | `oklch(0.380 0.090 283)` | derived | Visible separator on dark navy / black surfaces |
| `--input` | `oklch(0.380 0.090 283)` | derived | Input field border — matches border |
| `--ring` | `oklch(1 0 0)` | `#ffffff` | Focus ring — white ensures visibility on all dark backgrounds |
| `--surface` | `oklch(0.239 0.117 282.9)` | `#1c0d53` | Base raised surface (same value as --card) |
| `--surface-elevated` | `oklch(0.313 0.163 281.3)` | `#2b147f` | Modals, sheets, tooltips (same value as --popover) |

**WCAG contrast audit** — dark theme only. AA requires 4.5:1; AAA requires 7:1.

| Pairing | Ratio | Result |
|---|---|---|
| `--foreground` (#fff) on `--background` (#000) | 21.0:1 | AAA |
| `--foreground` (#fff) on `--card` / `--primary` (#1c0d53) | 17.1:1 | AAA |
| `--foreground` (#fff) on `--popover` / `--secondary` (#2b147f) | 13.9:1 | AAA |
| `--muted-foreground` (#dfe6e9) on `--background` (#000) | 16.6:1 | AAA |
| `--muted-foreground` (#dfe6e9) on `--card` (#1c0d53) | 13.5:1 | AAA |
| `--muted-foreground` (#dfe6e9) on `--popover` (#2b147f) | 11.0:1 | AAA |
| `--warning-foreground` (black) on `--warning` (~#d97706) | 7.7:1 | AAA |
| `--destructive-foreground` (white) on `--destructive` (~#dc2626) | 5.7:1 | AA |
| `--success-foreground` (white) on `--success` (~#16a34a) | 5.2:1 | AA |
| White on `--muted-foreground` (#dfe6e9) | 1.26:1 | **FAIL — forbidden pairing** |

**Judgment calls:**
1. **Background = black, not navy.** Pure black gives the highest contrast against white text (21:1) and makes the brand navy surface as cards and interactive elements rather than as wallpaper. Navy as background would flatten cards against it.
2. **Elevation hierarchy: black → primary navy → secondary navy.** The three-level stack (background → card/surface → popover/surface-elevated) maps directly onto the two navy values without introducing off-palette derived colors for elevated layers.
3. **Functional tokens retained.** Success, warning, and destructive keep conventional semantic colors (green, amber, red). In a pick-'em app these tokens carry unambiguous meaning — a locked pick, an approaching deadline, and an irreversible action must be distinguishable at a glance regardless of brand palette.
4. **--muted-foreground = light neutral (#dfe6e9), not white.** Secondary text uses the light neutral rather than pure white. It reads as softer / de-emphasized while still achieving AAA on all dark backgrounds in this palette. The slight cool cast at hue 225° fits the contemporary sports aesthetic.
5. **--warning-foreground = black.** Black achieves 7.7:1 AAA on amber; white would score ~2.9:1 (FAIL). This is the only token in the system where the foreground must be dark rather than white.

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
UI for permanent screen space, especially the bottom nav bar. The specific UX pattern
(collapsible trigger, shake-to-reveal, corner overlay, etc.) is a feature-level design
decision to be specified in the epic PRD that owns dev tooling — not prescribed here. The
standing constraint is the principle: no dev tool occupies permanent visible screen space
in the product UI.

**E6 and dev tooling:** E6 scenarios must be achievable via real role-provisioned test
accounts and real server-side state. Dev tooling (persona switcher, clock override) may be
used to *replicate* a scenario after the real-account path is verified, but may not serve
as the primary test precondition. An E6 scenario that can only be triggered via the
persona switcher — not via an actual test account with the corresponding role — is not a
valid E6 scenario.

## Enforcement
- **Jira DoD citation convention**: every UI/UX story's Definition of Done must include a
  checklist item: **"Design standards verified — see [PickEm v2 Design System & Mobile
  Standards](https://app.notion.com/p/3b0d4b15d22f815c8dbaefe8d08a2d4f)."** This is a
  per-ticket requirement — not a one-time epic-level comment. Tickets link here; they
  don't re-describe the rules.
- **DoD checklist item passes when:** (a) no product UI element renders within the
  `safe-area-inset-bottom` region — verify in Chrome DevTools with "Include safe areas"
  enabled or on a real notched device; (b) nav item count changes (including role-gated
  item removal) do not cause nav reflow or horizontal scroll; (c) the nav bottom edge
  stays above the home-indicator region.
- **R1 (PRD review)**: the design-reviewer checks each epic PRD for whether the design
  scope names which empty, loading, and error states need treatment for each
  data-fetching view. A PRD that introduces data-fetching views without naming its state
  treatments is incomplete at R1 — this check runs before tickets are written, not at E4.
- **E4 (code review)**: the code-reviewer agent is the first automated backstop. Any
  UI/UX ticket linking this doc in its DoD makes this doc a required review input at E4.
  Hard violations (missing safe-area insets, touch targets below minimums, input font
  below 16px) block the review. **Residual, not yet closed:** whether code-reviewer's
  actual invocation is configured to read this doc via the ticket link needs verifying
  when Epic 1 first reaches E4 — this doc names the requirement, it can't guarantee the
  agent config honors it.
- **E6 (epic E2E)**: the qa-reviewer authors the E6 scenario at planning time. For any
  epic that touches nav or page layout, the E6 scenario must include: (a) a 375px
  viewport step; (b) touch target assertions for primary interactive elements (min
  44×44pt, verified in DevTools or on device); (c) a thumb-reach assertion — primary
  submit/confirm actions visible below the viewport midpoint at 375px without scrolling;
  (d) an explicit enumeration for each data-fetching view of which states (loading /
  empty / error) are in scope and how each is triggered in test. An E6 scenario that does
  not address state coverage — even if the answer is "out of scope for this epic's
  views" — is incomplete.
- **E7 (Alex's QA moment)**: Alex's assembled-epic spot-check is the human backstop for
  UX judgment — feel, copy, and real-world scenarios the spec didn't anticipate.
- **Acknowledged gap**: the `design-reviewer` agent (R1) reviews PRDs for designability,
  not rendered UI. There is currently no agent that reviews built screens against these
  standards. E4 and E6 are the practical mitigations until that's extended.

## PWA installed state
For beta, installed-to-home-screen design treatments (splash screen, status bar color
when installed, offline / no-connection UI) are out of scope as designed deliverables.
Beta audience is 5–10 trusted players, not a public launch. Minimum required: set a
`theme-color` meta tag matching the app background; wire a standard install prompt.
Bespoke splash design and offline UI are post-beta items. If any epic's scope requires a
meaningful offline state (e.g. a cached picks view), the epic PRD must flag it and scope a
lightweight treatment within that epic.

## ENG standing constraints
These apply across all 8 epics and are not per-epic choices to be relitigated
independently.

**Image optimization:** All images must use `next/image`. No bare `<img>` tags on any
production page. WebP/AVIF output and lazy loading are handled automatically.

**Font loading:** Archivo Black (the display font) must be preloaded — configure
`preload: true` in its `next/font/google` call. Inter and JetBrains Mono do not require
explicit preload. All three fonts must use `display: 'swap'` to prevent invisible text
during load. Subset configuration is not required for beta; evaluate post-beta if mobile
LCP warrants it.

**Performance budget:** No hard LCP/INP/CLS targets for beta. Post-beta follow-up
required: establish a mobile performance budget before public launch. During beta: flag
any PR adding >50kB gzipped to the initial JS bundle as a team discussion item (not a
hard block).

**PWA / offline caching:** No offline-first caching or custom service worker strategy
required for beta. Standard install prompt is sufficient. Post-beta follow-up: define
shell-level cache behavior before public launch.

## Change log
*Mid-build changes to this doc require a Product or Design comment on any affected open
Jira tickets noting the update.*

| Date | Change | Epics in flight |
|---|---|---|
| Aug 2, 2026 | Initial doc created; parallel review (Design / ENG / QA / Product) completed | Pre-epic zero |
