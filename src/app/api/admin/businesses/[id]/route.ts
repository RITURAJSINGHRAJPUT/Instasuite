import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED = ["pending", "approved", "rejected"];

// Status changes live ONLY here, behind the admin+ guard. The client-facing
// routes whitelist their fields so they can never set status themselves.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!can(user?.role, "admin")) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const status = String(body?.status ?? "");
  if (!ALLOWED.includes(status)) {
    return Response.json({ error: `status must be one of ${ALLOWED.join(", ")}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("businesses").update({ status }).eq("id", id).select("id, status").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data);
}
