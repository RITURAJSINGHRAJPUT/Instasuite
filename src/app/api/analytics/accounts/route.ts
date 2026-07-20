import { getContext } from "@/lib/ownership";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

// Per-account totals for the Overview "By account" cards.
//
// All-time totals, scoped by ctx.accountIds — the same set getContext resolves for
// every user-driven route, so this can only ever return the caller's own accounts.
//
// Reservations and takeaway orders are NOT stored anywhere — reservations complete
// off-platform on TableCheck (the app never learns the outcome), and takeaways are
// only free text the AI wrote. So they're DETECTED here by scanning assistant
// messages: a heuristic estimate, surfaced as such in the UI, never a ledger. This
// scan is O(messages) — fine at this volume; a real orders table (the extraction
// pipeline in WHATSAPP-INTEGRATION-PLAN.md) is what this would need to scale.

// An order is "placed" once the agent posts a confirmation/summary. Match the final
// confirmation, not the in-progress "let me note that down" turns, so one order
// isn't counted several times.
const ORDER_RE =
  /\border summary\b|order\s+(?:is\s+)?confirmed|(?=[\s\S]*\bpickup\b)(?=[\s\S]*\btotal\b)[\s\S]*(?:\boutlet\b|\border:)/i;
// The only reservation signal that exists: the agent shared a TableCheck link.
const RESERVATION_RE = /tablecheck\.com|reserve\/(?:message|landing)/i;

type Stat = {
  conversations: number;
  human_handled: number;
  ai_replies: number;
  cost_cents: number;
  last_activity: string | null;
  takeaway_orders: number;
  reservations: number;
  orders: { customer: string; summary: string; at: string }[];
  reservation_list: { customer: string; detail: string; at: string }[];
};

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "overview")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (ctx.accountIds.length === 0) return Response.json([]);

  const ids = ctx.accountIds;

  const [accountsRes, convRes, usageRes, msgRes] = await Promise.all([
    supabaseAdmin.from("instagram_accounts").select("id, username, name, status").in("id", ids),
    supabaseAdmin
      .from("instagram_conversations")
      .select("instagram_account_id, mode, updated_at")
      .in("instagram_account_id", ids),
    supabaseAdmin
      .from("usage_events")
      .select("instagram_account_id, cost_cents")
      .eq("kind", "ai_reply")
      .in("instagram_account_id", ids),
    // Assistant messages + their conversation/account, for order/reservation detection.
    // !inner turns the embed into a real join so the account filter actually restricts.
    supabaseAdmin
      .from("instagram_messages")
      .select(
        "content, created_at, instagram_conversations!inner(id, name, username, instagram_account_id)"
      )
      .eq("role", "assistant")
      .in("instagram_conversations.instagram_account_id", ids),
  ]);

  if (accountsRes.error) {
    return Response.json({ error: accountsRes.error.message }, { status: 500 });
  }

  const stats = new Map<string, Stat>();
  for (const id of ids) {
    stats.set(id, {
      conversations: 0,
      human_handled: 0,
      ai_replies: 0,
      cost_cents: 0,
      last_activity: null,
      takeaway_orders: 0,
      reservations: 0,
      orders: [],
      reservation_list: [],
    });
  }

  for (const c of convRes.data ?? []) {
    const s = stats.get(c.instagram_account_id as string);
    if (!s) continue;
    s.conversations++;
    if (c.mode === "human") s.human_handled++;
    const ts = c.updated_at as string;
    if (ts && (!s.last_activity || ts > s.last_activity)) s.last_activity = ts;
  }

  for (const e of usageRes.data ?? []) {
    const s = stats.get(e.instagram_account_id as string);
    if (!s) continue;
    s.ai_replies++;
    s.cost_cents += Number(e.cost_cents ?? 0);
  }

  // Detect orders/reservations, deduped to ONE per conversation. Supabase types an
  // !inner embed as an array, so the conversation is read as [0].
  type MsgRow = {
    content: string | null;
    created_at: string;
    instagram_conversations:
      | { id: string; name: string | null; username: string | null; instagram_account_id: string }
      | { id: string; name: string | null; username: string | null; instagram_account_id: string }[];
  };
  const seenOrder = new Set<string>();
  const seenResv = new Set<string>();

  for (const m of (msgRes.data ?? []) as MsgRow[]) {
    const conv = Array.isArray(m.instagram_conversations)
      ? m.instagram_conversations[0]
      : m.instagram_conversations;
    if (!conv) continue;
    const s = stats.get(conv.instagram_account_id);
    if (!s) continue;
    const content = m.content ?? "";
    const customer = conv.name || conv.username || "Guest";

    if (ORDER_RE.test(content) && !seenOrder.has(conv.id)) {
      seenOrder.add(conv.id);
      s.takeaway_orders++;
      // Capped, not really truncated — a full order summary is well under this. The
      // detail popup on the Orders page shows the whole thing.
      s.orders.push({ customer, summary: content.slice(0, 2000), at: m.created_at });
    }
    if (RESERVATION_RE.test(content) && !seenResv.has(conv.id)) {
      seenResv.add(conv.id);
      s.reservations++;
      s.reservation_list.push({ customer, detail: content.slice(0, 800), at: m.created_at });
    }
  }

  type Account = { id: string; username: string | null; name: string | null; status: string };
  return Response.json(
    ((accountsRes.data ?? []) as Account[])
      .map((a) => {
        const s = stats.get(a.id)!;
        return {
          account_id: a.id,
          username: a.username,
          name: a.name,
          status: a.status,
          ...s,
        };
      })
      // Busiest first, matching the sibling analytics routes' ordering.
      .sort((a, b) => b.conversations - a.conversations)
  );
}
