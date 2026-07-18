import { getSessionUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

// The admin surface (approvals, plans, leads, usage) is open to admin+ — every
// role with the `admin` capability. Managing USERS is a separate, stricter gate
// (super_admin only; see /api/admin/users). 404 (not 403) so a role without
// access can't even confirm the surface exists.
export async function GET() {
  const user = await getSessionUser();
  if (!can(user?.role, "admin")) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: businesses } = await supabaseAdmin
    .from("businesses")
    .select("id, name, status, created_at, profiles(email)")
    .order("created_at", { ascending: true });

  const { data: accounts } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, ig_account_id, username, name, status, created_at, token_expires_at, businesses(name, profiles(email))")
    .order("created_at", { ascending: true });

  return Response.json({ businesses: businesses ?? [], accounts: accounts ?? [] });
}
