import { getSessionUser } from "@/lib/supabase-server";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";

// admin+ surface, guarded like every other /api/admin/* route (404, not 403, so a
// role without access can't even confirm the surface exists).
export async function GET() {
  const user = await getSessionUser();
  if (!can(user?.role, "admin")) return Response.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, email, instagram_handle, message, status, created_at")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
