import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getContext, getOwnedConversation } from "@/lib/ownership";
import { can } from "@/lib/permissions";

// Mark a review item done. Unlike orders' confirm, this sends NO DM — the human replies to the guest
// in the Inbox (the conversation was flipped to human mode at capture). This route just flips the row's
// status. Ownership is enforced via getOwnedConversation on the item's conversation.
//
// ?dismiss=1 marks it 'dismissed' instead of 'completed' (nothing to action) — both are terminal.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "review")) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: item } = await supabaseAdmin
    .from("review_items")
    .select("id, status, conversation_id")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; conversation_id: string }>();
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  // Ownership: the item's conversation must belong to the caller's accounts.
  const conversation = await getOwnedConversation(item.conversation_id, ctx);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

  const nextStatus = request.nextUrl.searchParams.get("dismiss") === "1" ? "dismissed" : "completed";

  // Idempotent: already terminal → return as-is, don't re-stamp.
  if (item.status !== "pending") {
    return Response.json({ id: item.id, status: item.status, already: true });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("review_items")
    .update({ status: nextStatus, completed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status, completed_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(updated);
}
