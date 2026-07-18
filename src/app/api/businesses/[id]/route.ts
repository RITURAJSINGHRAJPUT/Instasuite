import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getContext } from "@/lib/ownership";
import { can, isStaff } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "businesses")) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // FIELD WHITELIST. Passing the body through would let a client send
  // { status: "approved" } and approve themselves, bypassing the super-admin
  // gate entirely. `name` and `default_script_id` are client-editable; status
  // changes go through /api/admin/* which is super_admin-only.
  const patch: { name?: string; default_script_id?: string } = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();

  if (typeof body?.default_script_id === "string" && body.default_script_id) {
    // The chosen script must belong to THIS business, or you could point your
    // business's default at a script under someone else's business.
    const { data: script } = await supabaseAdmin
      .from("scripts")
      .select("id")
      .eq("id", body.default_script_id)
      .eq("business_id", id)
      .maybeSingle();
    if (!script) {
      return Response.json({ error: "That script doesn't belong to this business." }, { status: 400 });
    }
    patch.default_script_id = body.default_script_id;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  let q = supabaseAdmin.from("businesses").update(patch).eq("id", id);
  if (!isStaff(ctx.user.role)) q = q.eq("client_id", ctx.user.id); // ownership predicate

  const { data, error } = await q.select("id, name, status, default_script_id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data);
}
