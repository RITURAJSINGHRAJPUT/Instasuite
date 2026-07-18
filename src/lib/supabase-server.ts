import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Role } from "@/lib/permissions";

// USER-SCOPED CLIENT — uses the anon key plus the logged-in user's JWT, so RLS
// policies actually apply. This is the opposite of supabaseAdmin (service role),
// which bypasses RLS entirely.
//
// Use this for anything a logged-in user drives. Still add an explicit ownership
// predicate to every query — RLS is the safety net, not the only lock.
export async function createSupabaseServerClient() {
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
            // Called from a Server Component — the proxy refreshes the session instead.
          }
        },
      },
    }
  );
}

export type SessionUser = {
  id: string;
  email: string | null;
  role: Role;
};

/** The logged-in user + their profile role, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? "client",
  };
}
