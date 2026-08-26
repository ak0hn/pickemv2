import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side client, respects RLS via the anon key + the caller's session cookie.
// Use this everywhere except the one-off seed/admin scripts that need service_role.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component during render — safe to ignore since
            // middleware refreshes the session on the next request.
          }
        },
      },
    }
  );
}
