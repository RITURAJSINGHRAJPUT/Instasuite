import { supabaseAdmin } from "@/lib/supabase";

// Usage metering + plan enforcement.
//
// Every AI reply costs us real money (~2-3c on Opus). `plans.max_ig_accounts` was
// already enforced at connect time, but `plans.max_messages_per_month` was not —
// so a single tenant could burn unlimited spend. This is where that's closed.

/** Start of the current UTC calendar month — the billing period boundary. */
export function periodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type UsageTotals = {
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

/** What a client has consumed since the start of the current month. */
export async function getMonthlyUsage(clientId: string): Promise<UsageTotals> {
  const { data } = await supabaseAdmin
    .from("usage_events")
    .select("input_tokens, output_tokens, cost_cents")
    .eq("client_id", clientId)
    .eq("kind", "ai_reply")
    .gte("created_at", periodStart().toISOString());

  const rows = data ?? [];
  return {
    messages: rows.length,
    inputTokens: rows.reduce((n, r) => n + (r.input_tokens ?? 0), 0),
    outputTokens: rows.reduce((n, r) => n + (r.output_tokens ?? 0), 0),
    costCents: rows.reduce((n, r) => n + Number(r.cost_cents ?? 0), 0),
  };
}

export type QuotaCheck = {
  allowed: boolean;
  used: number;
  limit: number | null; // null = unlimited
  reason?: string;
};

/**
 * Can this client generate another AI reply this month?
 *
 * Fails CLOSED on an inactive subscription (no plan => no replies) but treats a
 * null max_messages_per_month as unlimited, which is how the schema expresses
 * "no cap on this plan".
 */
export async function checkMessageQuota(clientId: string): Promise<QuotaCheck> {
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plans(max_messages_per_month)")
    .eq("client_id", clientId)
    .maybeSingle<{ status: string; plans: { max_messages_per_month: number | null } | null }>();

  if (!sub || !["active", "trialing"].includes(sub.status)) {
    return { allowed: false, used: 0, limit: 0, reason: "No active subscription." };
  }

  const limit = sub.plans?.max_messages_per_month ?? null;
  if (limit === null) return { allowed: true, used: 0, limit: null };

  const { messages } = await getMonthlyUsage(clientId);
  return {
    allowed: messages < limit,
    used: messages,
    limit,
    reason: messages < limit ? undefined : `Monthly message limit reached (${messages}/${limit}).`,
  };
}
