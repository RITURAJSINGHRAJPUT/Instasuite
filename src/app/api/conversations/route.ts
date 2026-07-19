import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getContext } from "@/lib/ownership";
import { can } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "inbox")) return Response.json({ error: "Not found" }, { status: 404 });

  // The two response shapes differ, so every early return has to honour the mode
  // or a caller asking for a count gets an array and reads `undefined`.
  const wantCount = request.nextUrl.searchParams.get("count") === "1";
  const empty = () => Response.json(wantCount ? { count: 0 } : []);

  if (ctx.accountIds.length === 0) return empty();

  // Optional account filter for the dashboard switcher. It can only NARROW
  // within the caller's own accounts — a foreign id intersects to nothing
  // rather than widening the scope.
  const requested = request.nextUrl.searchParams.get("account_id");
  const scope = requested
    ? ctx.accountIds.filter((id) => id === requested)
    : ctx.accountIds;
  if (scope.length === 0) return empty();

  // ?count=1 returns just the total. The dashboard needs a single integer for a
  // stat card, and without this it pulled every conversation row AND ran the
  // per-conversation last-message query below for each one — N+1 round trips to
  // render one number.
  if (wantCount) {
    const { count, error: countError } = await supabaseAdmin
      .from("instagram_conversations")
      .select("id", { count: "exact", head: true })
      .in("instagram_account_id", scope);

    if (countError) return Response.json({ error: countError.message }, { status: 500 });
    return Response.json({ count: count ?? 0 });
  }

  // Scoped to the caller's Instagram accounts — previously this returned EVERY
  // conversation in the database.
  const { data: conversations, error } = await supabaseAdmin
    .from("instagram_conversations")
    .select("*")
    .in("instagram_account_id", scope)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const withLastMessage = await Promise.all(
    (conversations || []).map(async (convo) => {
      const { data: messages } = await supabaseAdmin
        .from("instagram_messages")
        .select("content, role, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      return { ...convo, last_message: messages?.[0]?.content || null };
    })
  );

  return Response.json(withLastMessage);
}
