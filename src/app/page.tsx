import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase-server";
import { firstAllowedRoute } from "@/lib/permissions";

// This is a private, single-operator tool — there's no public marketing page.
// Send the root into the app, landing each role on the first section it can use
// (an agent has no Overview, so it goes to /inbox rather than a denied page).
// Signed-out visitors are bounced to /login by the proxy, and firstAllowedRoute
// returns /login for an unknown role as a fail-safe.
// (The Instasuite landing + request-access components are kept in the repo, just
// unreachable, so multi-tenant mode can be restored later.)
export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(firstAllowedRoute(user.role));
}
