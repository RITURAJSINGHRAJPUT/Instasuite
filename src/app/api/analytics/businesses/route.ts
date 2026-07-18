import { getContext } from "@/lib/ownership";
import { can, isStaff } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

// Per-business rollup for the Overview "Business Performance" table.
//
// The mockup's "AI Efficiency / accuracy %" column is absent on purpose: there is
// no ground-truth signal anywhere in the schema (no rating, CSAT, resolution or
// correctness column), so any such number would be invented. Replies and spend
// are the real, measured facts, so those are what the table shows.
//
// usage_events carries business_id directly, which is why this doesn't need the
// message->conversation->account join that /analytics/volume does.

type Row = { messages: number; costCents: number; prev: number };

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "overview")) return Response.json({ error: "Not found" }, { status: 404 });

  let bq = supabaseAdmin
    .from("businesses")
    .select("id, name, status, instagram_accounts(username)");
  if (!isStaff(ctx.user.role)) bq = bq.eq("client_id", ctx.user.id);

  const { data: businesses, error } = await bq;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!businesses?.length) return Response.json([]);

  const ids = businesses.map((b) => b.id);
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now - 14 * 86_400_000);

  // Two weeks in one query; split in memory so the delta is last-7 vs the 7
  // before it — a real week-over-week, not the mockup's unexplained "vs LY".
  const { data: events } = await supabaseAdmin
    .from("usage_events")
    .select("business_id, cost_cents, created_at")
    .in("business_id", ids)
    .gte("created_at", twoWeeksAgo.toISOString());

  const agg = new Map<string, Row>();
  for (const id of ids) agg.set(id, { messages: 0, costCents: 0, prev: 0 });

  for (const e of events ?? []) {
    const row = agg.get(e.business_id as string);
    if (!row) continue;
    if (new Date(e.created_at as string) >= weekAgo) {
      row.messages++;
      row.costCents += Number(e.cost_cents ?? 0);
    } else {
      row.prev++;
    }
  }

  return Response.json(
    businesses
      .map((b) => {
        const r = agg.get(b.id)!;
        return {
          id: b.id,
          name: b.name,
          status: b.status,
          handles: (b.instagram_accounts ?? [])
            .map((a: { username: string | null }) => a.username)
            .filter(Boolean),
          messages: r.messages,
          costCents: r.costCents,
          // null (not 0) when there's no prior week to compare against — the UI
          // omits the delta rather than rendering a meaningless "+100%".
          deltaPct: r.prev === 0 ? null : Math.round(((r.messages - r.prev) / r.prev) * 100),
        };
      })
      .sort((a, b) => b.messages - a.messages)
  );
}
