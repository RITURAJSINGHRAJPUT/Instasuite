import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser, type SessionUser } from "@/lib/supabase-server";
import { isStaff } from "@/lib/permissions";

// Ownership helpers for user-driven routes.
//
// Every conversation belongs to an instagram_account -> business -> client. These
// resolve that chain so each route can filter by it. Never trust a UUID in a URL:
// scope the query itself, so a wrong id returns "not found" rather than data.

export type Ctx = { user: SessionUser; accountIds: string[] };

/**
 * The logged-in user plus every Instagram account they can act on. Staff
 * (super_admin/admin/manager/agent) see the operator's whole account set; a
 * legacy `client` tenant sees only accounts under its own businesses.
 */
export async function getContext(): Promise<Ctx | null> {
  const user = await getSessionUser();
  if (!user) return null;

  let query = supabaseAdmin.from("instagram_accounts").select("id, businesses!inner(client_id)");
  if (!isStaff(user.role)) {
    query = query.eq("businesses.client_id", user.id);
  }

  const { data } = await query;
  return { user, accountIds: (data ?? []).map((r: { id: string }) => r.id) };
}

/**
 * Fetch a conversation only if the caller owns it. Returns null otherwise, so
 * callers 404 instead of leaking existence.
 */
export async function getOwnedConversation(conversationId: string, ctx: Ctx) {
  if (ctx.accountIds.length === 0) return null;

  const { data } = await supabaseAdmin
    .from("instagram_conversations")
    .select("*")
    .eq("id", conversationId)
    .in("instagram_account_id", ctx.accountIds) // <- the ownership predicate
    .maybeSingle();

  return data;
}
