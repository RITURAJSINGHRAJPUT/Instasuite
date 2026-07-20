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

// A fresh zero-filled day map for one account, so days with no traffic plot as 0
// rather than letting the line interpolate over a gap.
function freshBuckets(start: Date, days: number): Map<string, { inbound: number; outbound: number }> {
  const m = new Map<string, { inbound: number; outbound: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    m.set(utcDayKey(d), { inbound: 0, outbound: 0 });
  }
  return m;
}

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "overview")) return Response.json({ error: "Not found" }, { status: 404 });

  const raw = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const days = Number.isFinite(raw) ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(raw))) : 30;

  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));

  // One zero-filled series PER account — so the Overview can show a section for
  // each connected account, and an account with no traffic still gets a flat
  // section rather than disappearing.
  const perAccount = new Map<string, ReturnType<typeof freshBuckets>>();
  for (const id of ctx.accountIds) perAccount.set(id, freshBuckets(start, days));

  if (ctx.accountIds.length === 0) {
    return Response.json({ days, start: start.toISOString(), total: 0, accounts: [] });
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
    // The !inner embed types as object-or-array depending on the query shape.
    const conv = row.instagram_conversations as
      | { instagram_account_id: string }
      | { instagram_account_id: string }[];
    const accId = Array.isArray(conv) ? conv[0]?.instagram_account_id : conv?.instagram_account_id;
    const bmap = accId ? perAccount.get(accId) : undefined;
    if (!bmap) continue;
    const b = bmap.get(utcDayKey(new Date(row.created_at as string)));
    if (!b) continue; // future-dated or outside the window
    if (row.role === "user") b.inbound++;
    else b.outbound++;
    total++;
  }

  const accounts = [...perAccount.entries()].map(([account_id, bmap]) => {
    const series = [...bmap.entries()].map(([date, v]) => ({
      date,
      ...v,
      total: v.inbound + v.outbound,
    }));
    return { account_id, total: series.reduce((sum, p) => sum + p.total, 0), series };
  });

  return Response.json({ days, start: start.toISOString(), total, accounts });
}
