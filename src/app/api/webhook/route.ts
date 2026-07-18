import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendInstagramMessage, fetchInstagramProfile } from "@/lib/instagram";
import { getAIResponse } from "@/lib/ai";
import { resolveAccountByIgId, type ResolvedAccount } from "@/lib/tenant";
import { checkMessageQuota } from "@/lib/usage";
import { withSlot } from "@/lib/queue";

// The reply is generated in after() (see below), and on Vercel that background
// work is bounded by THIS function's maxDuration — exceed it and the reply is
// killed mid-generation while Meta already got its 200, i.e. a silent no-reply.
// Pin it rather than depend on the platform default staying generous. An LLM
// reply is ~10-30s; 60s covers a small batch. Raise for slower models.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Platform-level: one Meta app = one callback URL = one verify token.
  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Messaging = any;

/**
 * Meta signs every webhook with the app secret. Without this check anyone who
 * learns the URL can forge an event — and now that entry[0].id selects a tenant,
 * a forged event is a cross-tenant write.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    // Fail open only when unconfigured, and say so loudly — otherwise a missing
    // env var would silently drop every real message.
    console.warn("META_APP_SECRET not set — webhook signature NOT verified.");
    return true;
  }
  if (!header?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Read the raw body: the signature is over exact bytes, so re-serialising breaks it.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn("Rejected webhook with an invalid X-Hub-Signature-256.");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { object?: string; entry?: { id?: string; messaging?: Messaging[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "instagram") {
    return Response.json({ status: "ignored" });
  }

  // Acknowledge Meta immediately (must respond within ~5s or it retries the event,
  // causing duplicate processing). Heavy work runs after the response.
  for (const entry of body.entry ?? []) {
    // entry.id IS the destination Instagram business account — i.e. which tenant
    // this DM belongs to. Everything downstream is scoped by it.
    const igAccountId = entry.id;
    if (!igAccountId) continue;

    for (const messaging of entry.messaging ?? []) {
      if (messaging?.message?.is_echo) continue;
      if (!messaging?.message?.text) continue;
      // Bounded: a burst of DMs queues instead of firing unlimited concurrent AI calls.
      after(() => withSlot(() => processMessage(igAccountId, messaging)));
    }
  }

  return Response.json({ status: "received" });
}

async function processMessage(igAccountId: string, messaging: Messaging) {
  const igsid = messaging.sender.id;
  const text = messaging.message.text;
  const instagramMsgId = messaging.message.mid;

  try {
    // Which tenant owns this account? Unknown / unapproved => ignore. Never fall
    // back to another tenant.
    const account = await resolveAccountByIgId(igAccountId);
    if (!account) return;

    const conversation = await findOrCreateConversation(account, igsid);
    if (!conversation) {
      console.error("Failed to create conversation for", igsid, "on", igAccountId);
      return;
    }

    // Store user message. Duplicate mid (Meta retry) is now scoped per-conversation.
    const { error: insertError } = await supabaseAdmin.from("instagram_messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      instagram_msg_id: instagramMsgId,
    });
    if (insertError?.code === "23505") return;

    await touch(conversation.id);

    if (conversation.mode === "human") return;

    // Plan quota. Checked BEFORE the AI call, because the AI call is the thing
    // that costs money. The inbound message is still stored above, so nothing is
    // lost — the tenant just stops getting auto-replies until the period rolls
    // over or they upgrade.
    const quota = await checkMessageQuota(account.clientId);
    if (!quota.allowed) {
      console.warn(
        `Quota blocked reply for client ${account.clientId} on @${account.username}: ${quota.reason}`
      );
      return;
    }

    const { data: history } = await supabaseAdmin
      .from("instagram_messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(20);

    // This tenant's script — not a module-level constant.
    const ai = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { systemPrompt: account.systemPrompt }
    );

    // Reply FROM this tenant's account: the token is the sender identity.
    await sendInstagramMessage(igsid, ai.text, account.accessToken);

    await supabaseAdmin.from("instagram_messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: ai.text,
    });

    await touch(conversation.id);
    await recordUsage(account, ai);
  } catch (error) {
    console.error("Webhook processing error:", error);
  }
}

async function findOrCreateConversation(account: ResolvedAccount, igsid: string) {
  // Scoped by account: the same customer may talk to several tenants, and each
  // gets its own conversation (this is what UNIQUE(instagram_account_id, igsid) allows).
  const { data: existing } = await supabaseAdmin
    .from("instagram_conversations")
    .select("*")
    .eq("instagram_account_id", account.accountId)
    .eq("igsid", igsid)
    .maybeSingle();

  const profile = await fetchInstagramProfile(igsid, account.accessToken);

  if (existing) {
    await supabaseAdmin
      .from("instagram_conversations")
      .update(profile)
      .eq("id", existing.id);
    return { ...existing, ...profile };
  }

  const { data: created, error } = await supabaseAdmin
    .from("instagram_conversations")
    .insert({ instagram_account_id: account.accountId, igsid, ...profile })
    .select()
    .single();

  if (error) console.error("Conversation insert failed:", error.message);
  return created;
}

async function touch(conversationId: string) {
  await supabaseAdmin
    .from("instagram_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

// Per-reply COGS. Phase 3 bills off this table.
async function recordUsage(
  account: ResolvedAccount,
  ai: Awaited<ReturnType<typeof getAIResponse>>
) {
  if (ai.provider === "none") return;
  // Opus 4.8: $5/1M in, $25/1M out -> cents per token.
  const costCents =
    ai.provider === "claude" && ai.inputTokens != null && ai.outputTokens != null
      ? (ai.inputTokens / 1_000_000) * 500 + (ai.outputTokens / 1_000_000) * 2500
      : 0;

  await supabaseAdmin.from("usage_events").insert({
    client_id: account.clientId,
    business_id: account.businessId,
    instagram_account_id: account.accountId,
    kind: "ai_reply",
    model: ai.model,
    input_tokens: ai.inputTokens,
    output_tokens: ai.outputTokens,
    cost_cents: costCents,
  });
}
