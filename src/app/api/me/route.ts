import { getSessionUser } from "@/lib/supabase-server";
import { capabilitiesFor } from "@/lib/permissions";

// The current user's identity + capabilities. The sidebar and the page guard read
// this to decide what to show. It is UX only — every feature API re-checks the
// role server-side, so this response can be spoofed with no effect.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({
    id: user.id,
    email: user.email,
    role: user.role,
    capabilities: capabilitiesFor(user.role),
  });
}
