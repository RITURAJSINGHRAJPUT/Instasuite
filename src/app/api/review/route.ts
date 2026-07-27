import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getContext } from "@/lib/ownership";
import { can } from "@/lib/permissions";

// The Review page's data source — non-order handoffs (the `review_items` ledger), scoped to the caller's
// accounts. Reads via the service-role client (RLS-on/no-policy); scoping is by the row's own
// `instagram_account_id` (snapshotted at capture) so records survive a deleted chat. Mirrors /api/orders.

type Joined = {
  id: string;
  category: string;
  customer_name: string | null;
  details: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  conversation_id: string | null;
  instagram_account_id: string | null;
  instagram_accounts: { username: string | null } | { username: string | null }[] | null;
};

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "review")) return Response.json({ error: "Not found" }, { status: 404 });

  // ?count=1 returns just the number of PENDING items — what the sidebar badge shows.
  const wantCount = request.nextUrl.searchParams.get("count") === "1";
  if (ctx.accountIds.length === 0) return Response.json(wantCount ? { count: 0 } : []);

  if (wantCount) {
    const { count, error } = await supabaseAdmin
      .from("review_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .in("instagram_account_id", ctx.accountIds);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ count: count ?? 0 });
  }

  // Scope by the item's own account (staff = all, client = own). The account embed gives the username;
  // conversation_id is kept for the "open chat" link (null if the chat was deleted).
  const { data, error } = await supabaseAdmin
    .from("review_items")
    .select(
      "id, category, customer_name, details, status, created_at, completed_at, conversation_id, instagram_account_id, instagram_accounts(username)"
    )
    .in("instagram_account_id", ctx.accountIds)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as unknown as Joined[]).map((r) => {
    const acc = Array.isArray(r.instagram_accounts) ? r.instagram_accounts[0] : r.instagram_accounts;
    return {
      id: r.id,
      category: r.category,
      customer_name: r.customer_name,
      details: r.details,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      conversation_id: r.conversation_id,
      account_id: r.instagram_account_id ?? null,
      account_username: acc?.username ?? null,
    };
  });

  return Response.json(rows);
}
