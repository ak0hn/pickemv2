# PickEm v2

An NFL against-the-spread pick'em league app — a mobile-first PWA rebuild of a private
league's manual (email + spreadsheet) pick'em process.

Stack: Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Supabase (planned)

## Status

This is a rough end-to-end skeleton, not a finished build. It scaffolds the app's
information architecture (Feed, This Week/Picks, League, Profile, Commish Tools) and
design system against mock data, so real feature work can build into an already-correct
shell instead of reinventing layout/navigation per feature. See
[`PickEm-v2_DesignSystem.md`](./PickEm-v2_DesignSystem.md) for the mobile design
standards this app is built against.

Backend (Supabase schema, RLS, auth) is not wired up yet — every page currently reads
from `lib/mock/data.ts`.

## Dev tooling

Local development includes a dev-only control panel (wrench icon, bottom-left) for
testing without real auth or waiting on real time to pass:

- **Persona switcher** — view the app as any mock GM or commissioner, without logging in
- **Clock override** — fast-forward the app's notion of "now" to test week-to-week and
  day-to-day behavior (pick locks, the post-Sunday tiebreaker flow, etc.) without waiting
  on the calendar

Neither appears in a production build.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
