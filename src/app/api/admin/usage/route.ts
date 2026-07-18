import { getSessionUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";
import { periodStart } from "@/lib/usage";

type Row = { client_id: string | null; cost_cents: number | null; profiles: { email: string | null } | null };

// Platform-wide COGS for the current month, per client. This is the number that
// tells you whether a tenant is eroding margin.
export async function GET() {
  const user = await getSessionUser();
  if (!can(user?.role, "admin")) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: events } = await supabaseAdmin
    .from("usage_events")
    .select("client_id, cost_cents, profiles(email)")
    .gte("created_at", periodStart().toISOString())
    .returns<Row[]>();

  const byClient = new Map<string, { email: string; messages: number; cost_cents: number }>();
  for (const e of events ?? []) {
    const key = e.client_id ?? "unknown";
    const row = byClient.get(key) ?? { email: e.profiles?.email ?? "unknown", messages: 0, cost_cents: 0 };
    row.messages += 1;
    row.cost_cents += Number(e.cost_cents ?? 0);
    byClient.set(key, row);
  }

  const clients = Array.from(byClient.values()).sort((a, b) => b.cost_cents - a.cost_cents);
  return Response.json({
    period_start: periodStart().toISOString(),
    total_cost_cents: clients.reduce((n, c) => n + c.cost_cents, 0),
    total_messages: clients.reduce((n, c) => n + c.messages, 0),
    clients,
  });
}
