import { NextRequest } from "next/server";
import { getContext } from "@/lib/ownership";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

// Daily message volume for the Overview chart.
//
// Deliberately NOT built on usage.ts's periodStart(): that returns the UTC
// calendar-month boundary, so on the 1st a "30-day" chart would contain a single
// day. This is a rolling window ending today.
//
// Counts BOTH directions (customer + reply) — it answers "how busy is the inbox",
// not "how much AI did I buy". Note instagram_messages cannot distinguish an AI
// reply from a human one (both are role:'assistant', there is no source column),
// so the assistant series is not split.

const MAX_DAYS = 90;

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "overview")) return Response.json({ error: "Not found" }, { status: 404 });

  const raw = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const days = Number.isFinite(raw) ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(raw))) : 30;

  // Zero-fill the buckets up front, so days with no traffic plot as 0 rather
  // than vanishing and letting the line interpolate over a gap.
  const buckets = new Map<string, { inbound: number; outbound: number }>();
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    buckets.set(utcDayKey(d), { inbound: 0, outbound: 0 });
  }

  if (ctx.accountIds.length === 0) {
    return Response.json({
      days,
      start: start.toISOString(),
      series: [...buckets.entries()].map(([date, v]) => ({ date, ...v, total: 0 })),
      total: 0,
    });
  }

  // !inner turns the embed into a join so the account filter actually restricts
  // rows — the ownership predicate, same as getOwnedConversation's.
  const { data, error } = await supabaseAdmin
    .from("instagram_messages")
    .select("created_at, role, instagram_conversations!inner(instagram_account_id)")
    .in("instagram_conversations.instagram_account_id", ctx.accountIds)
    .gte("created_at", start.toISOString());

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let total = 0;
  for (const row of data ?? []) {
    const key = utcDayKey(new Date(row.created_at as string));
    const b = buckets.get(key);
    if (!b) continue; // future-dated row, or one outside the window
    if (row.role === "user") b.inbound++;
    else b.outbound++;
    total++;
  }

  return Response.json({
    days,
    start: start.toISOString(),
    series: [...buckets.entries()].map(([date, v]) => ({
      date,
      ...v,
      total: v.inbound + v.outbound,
    })),
    total,
  });
}
