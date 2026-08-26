"use server";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/mock/types";

// Dev-only bridge between the persona switcher and a real Supabase Auth session, so
// RLS/role checks stay live and testable for Epics 1-7 without waiting on Epic 8's real
// auth UI (per the Project Plan's Environment Strategy — pre-seeded test accounts, not
// service_role). Must never run in production.
const DEV_ACCOUNTS: Record<Role, string> = {
  commissioner: "dev-commish@pickemv2.test",
  gm: "dev-gm@pickemv2.test",
};

export async function devSignInAs(role: Role) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("devSignInAs is dev-only and must not run in production");
  }

  const password = process.env.DEV_TEST_ACCOUNT_PASSWORD;
  if (!password) {
    throw new Error("DEV_TEST_ACCOUNT_PASSWORD is not set in .env.local");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEV_ACCOUNTS[role],
    password,
  });

  if (error) {
    throw new Error(`Dev sign-in failed for ${role}: ${error.message}`);
  }
}
