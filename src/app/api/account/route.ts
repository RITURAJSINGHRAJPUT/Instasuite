import { supabaseAdmin } from "@/lib/supabase";
import { getContext } from "@/lib/ownership";
import { can } from "@/lib/permissions";

// The Instagram accounts the caller owns. Reads from our own DB rather than
// Meta's /me, so it is per-tenant by construction.
//
// NOTE: access_token is deliberately never selected here — it is another
// business's credential and must never reach the browser. (The previous version
// also had a module-scope cache that would have served tenant A's account to
// tenant B.)
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "inbox")) return Response.json({ error: "Not found" }, { status: 404 });
  if (ctx.accountIds.length === 0) return Response.json([]);

  const { data, error } = await supabaseAdmin
    .from("instagram_accounts")
    // token_expires_at (not the token itself) so a client can see their own
    // account about to go dark. Previously only super-admins could, via
    // /api/admin/pending, even though tokenAge() existed to render it.
    //
    // script_id + default_script_id let the inbox name the script that is
    // actually answering a conversation, using the same resolution order as
    // tenant.ts:68 — the account's own script, else the business default.
    .select(
      "id, ig_account_id, username, name, profile_picture_url, status, business_id, token_expires_at, script_id, businesses(name, default_script_id)"
    )
    .in("id", ctx.accountIds)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
