// One-off dev seed: creates test auth users + roster rows so Epic 1-7 tickets can be
// tested against real RLS policies without waiting for Epic 8's auth UI, per the Project
// Plan's Environment Strategy (pre-seeded test-user accounts, not service_role at runtime).
// Uses service_role here ONLY because creating auth users requires the admin API — the
// app itself never uses service_role for request-time access.
//
// Sep 7, 2026 (Alex's live PIC-32 QA): one account per persona now, not one per role — a
// shared "dev-gm@..." account for every GM-labeled persona meant the mock switcher's GM
// names were cosmetic only, and any feature reading real per-user data (reactions, PIC-32)
// couldn't actually tell two different GMs apart. This list must be kept in sync with
// lib/mock/data.ts's MOCK_GMS by id — this script runs standalone via plain node, so it
// can't import that TS file directly (same constraint as the other seed-dev-*.mjs scripts).
//
// Run: node --env-file=.env.local scripts/seed-dev-users.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const devPassword = readFileSync(new URL("../.dev_test_password", import.meta.url), "utf8").trim();

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mirrors lib/mock/data.ts's MOCK_GMS 1:1 by id — devSignInAs derives the email from
// persona.id as `dev-${id}@pickemv2.test`, so an id here must match exactly.
const testUsers = [
  { id: "gm-1", displayName: "Jordan P.", role: "commissioner" },
  { id: "gm-2", displayName: "Sam T.", role: "commissioner" },
  { id: "gm-3", displayName: "Riley M.", role: "gm" },
  { id: "gm-4", displayName: "Casey B.", role: "gm" },
  { id: "gm-5", displayName: "Drew H.", role: "gm" },
  { id: "gm-6", displayName: "Quinn A.", role: "gm" },
  { id: "gm-7", displayName: "Morgan L.", role: "gm" },
].map((u) => ({ ...u, email: `dev-${u.id}@pickemv2.test` }));

for (const u of testUsers) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: u.email,
    password: devPassword,
    email_confirm: true,
  });

  let authUserId = created?.user?.id;

  if (createErr) {
    if (createErr.message.includes("already been registered")) {
      // Default page size is 100 — explicit perPage avoids silently missing the user
      // on a project that already has more than 100 auth users.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      authUserId = list.users.find((x) => x.email === u.email)?.id;
    } else {
      console.error(`Failed to create ${u.email}:`, createErr.message);
      continue;
    }
  }

  const { error: rosterErr } = await admin
    .from("roster")
    .upsert(
      { auth_user_id: authUserId, email: u.email, display_name: u.displayName, role: u.role },
      { onConflict: "email" }
    );

  if (rosterErr) {
    console.error(`Failed to upsert roster row for ${u.email}:`, rosterErr.message);
  } else {
    console.log(`Seeded ${u.role}: ${u.email}`);
  }
}
