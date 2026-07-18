import { supabaseAdmin } from "@/lib/supabase";
import { getContext } from "@/lib/ownership";
import { can } from "@/lib/permissions";
import { getMonthlyUsage, periodStart } from "@/lib/usage";

type UsageRow = {
  instagram_account_id: string | null;
  cost_cents: number | null;
  instagram_accounts: { username: string | null } | null;
};

// The caller's own consumption this billing period. Scoped by client_id, so a
// client can only ever see their own spend.
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "overview")) return Response.json({ error: "Not found" }, { status: 404 });

  const totals = await getMonthlyUsage(ctx.user.id);

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end, plans(name, max_ig_accounts, max_messages_per_month, price_cents)")
    .eq("client_id", ctx.user.id)
    .maybeSingle();

  const { data: events } = await supabaseAdmin
    .from("usage_events")
    .select("instagram_account_id, cost_cents, instagram_accounts(username)")
    .eq("client_id", ctx.user.id)
    .gte("created_at", periodStart().toISOString())
    .returns<UsageRow[]>();

  const byAccount = new Map<string, { username: string; messages: number; cost_cents: number }>();
  for (const e of events ?? []) {
    const key = e.instagram_account_id ?? "unknown";
    const row = byAccount.get(key) ?? {
      username: e.instagram_accounts?.username ?? "unknown",
      messages: 0,
      cost_cents: 0,
    };
    row.messages += 1;
    row.cost_cents += Number(e.cost_cents ?? 0);
    byAccount.set(key, row);
  }

  return Response.json({
    period_start: periodStart().toISOString(),
    totals,
    subscription: subscription ?? null,
    by_account: Array.from(byAccount.values()).sort((a, b) => b.cost_cents - a.cost_cents),
  });
}
