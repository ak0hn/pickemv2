// One-off dev seed: creates test auth users + roster rows so Epic 1-7 tickets can be
// tested against real RLS policies without waiting for Epic 8's auth UI, per the Project
// Plan's Environment Strategy (pre-seeded test-user accounts, not service_role at runtime).
// Uses service_role here ONLY because creating auth users requires the admin API — the
// app itself never uses service_role for request-time access.
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

const testUsers = [
  { email: "dev-commish@pickemv2.test", displayName: "Dev Commissioner", role: "commissioner" },
  { email: "dev-gm@pickemv2.test", displayName: "Dev GM", role: "gm" },
];

for (const u of testUsers) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: u.email,
    password: devPassword,
    email_confirm: true,
  });

  let authUserId = created?.user?.id;

  if (createErr) {
    if (createErr.message.includes("already been registered")) {
      const { data: list } = await admin.auth.admin.listUsers();
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
