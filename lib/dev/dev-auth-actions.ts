"use server";

import { createClient } from "@/lib/supabase/server";

// Dev-only bridge between the persona switcher and a real Supabase Auth session, so
// RLS/role checks stay live and testable for Epics 1-7 without waiting on Epic 8's real
// auth UI (per the Project Plan's Environment Strategy — pre-seeded test accounts, not
// service_role). Must never run in real production.
//
// Sep 7, 2026 (Alex's live PIC-32 QA): this used to be keyed by Role (one shared account
// for every "gm"-labeled persona, one for every "commissioner"-labeled one), which was fine
// while every dev-tooled feature only cared about role — but reactions need to tell
// individual GMs apart, and a shared account meant every GM persona in the switcher was
// secretly the same real roster row underneath (confirmed live: the reactor sheet showed
// "Dev GM" for every reaction, not the persona's actual name). Keyed by persona id now —
// one real Supabase test account per MOCK_GMS entry (seed-dev-users.mjs), so the switcher's
// 1:1 promise ("this dropdown = this identity") is actually true for any feature that reads
// real per-user data, not just ones that happen to only care about role.
export async function devSignInAs(personaId: string) {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("devSignInAs is dev-only and must not run in production");
  }

  const password = process.env.DEV_TEST_ACCOUNT_PASSWORD;
  if (!password) {
    throw new Error("DEV_TEST_ACCOUNT_PASSWORD is not set in .env.local");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: `dev-${personaId}@pickemv2.test`,
    password,
  });

  if (error) {
    throw new Error(`Dev sign-in failed for persona ${personaId}: ${error.message}`);
  }
}
