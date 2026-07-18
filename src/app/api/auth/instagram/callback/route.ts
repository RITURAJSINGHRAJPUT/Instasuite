import { NextRequest } from "next/server";
import { getContext } from "@/lib/ownership";
import { can, isStaff } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";
import { encryptSecret } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchConnectedAccount,
  subscribeToWebhooks,
} from "@/lib/instagram";

/**
 * Instagram Business Login callback.
 *
 * Mirrors POST /api/accounts (plan limit, /me identity, already-connected, encrypt
 * at rest, pending unless a super-admin connects) — the only difference is where
 * the token comes from. Redirects back to /businesses with a human-readable
 * message rather than returning JSON, because this lands in a browser.
 */
function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/businesses", request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = new Headers({ Location: url.toString() });
  // Burn the one-shot cookies whatever the outcome.
  for (const c of ["ig_oauth_state", "ig_oauth_business"]) {
    headers.append("Set-Cookie", `${c}=; Path=/api/auth/instagram; HttpOnly; Max-Age=0`);
  }
  return new Response(null, { status: 302, headers });
}

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "businesses")) return Response.json({ error: "Not found" }, { status: 404 });

  const q = request.nextUrl.searchParams;

  // The user pressed Cancel, or Meta refused.
  const denied = q.get("error_description") || q.get("error");
  if (denied) return back(request, { ig_error: denied });

  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return back(request, { ig_error: "Instagram didn't return an authorization code." });

  // CSRF: state must match the cookie we set before leaving.
  const cookieState = request.cookies.get("ig_oauth_state")?.value;
  const businessId = request.cookies.get("ig_oauth_business")?.value;
  if (!cookieState || !businessId || cookieState !== state) {
    return back(request, { ig_error: "That login link expired or didn't match. Please try again." });
  }

  // Re-check ownership on the way back — the cookie is attacker-influenced in
  // principle, so it never substitutes for a real ownership query.
  let bq = supabaseAdmin.from("businesses").select("id, client_id").eq("id", businessId);
  if (!isStaff(ctx.user.role)) bq = bq.eq("client_id", ctx.user.id);
  const { data: business } = await bq.maybeSingle<{ id: string; client_id: string }>();
  if (!business) return back(request, { ig_error: "That business no longer exists." });

  // Plan limit, same rule and same semantics as the paste flow — and the same
  // staff exemption: the operator's team can always connect another account.
  if (!isStaff(ctx.user.role)) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("plans(max_ig_accounts)")
      .eq("client_id", business.client_id)
      .maybeSingle<{ plans: { max_ig_accounts: number } | null }>();
    const maxAccounts = sub?.plans?.max_ig_accounts ?? 0;
    const { data: owned } = await supabaseAdmin
      .from("instagram_accounts")
      .select("id, businesses!inner(client_id)")
      .eq("businesses.client_id", business.client_id);
    if ((owned?.length ?? 0) >= maxAccounts) {
      return back(request, {
        ig_error: `Your plan allows ${maxAccounts} Instagram account${maxAccounts === 1 ? "" : "s"}.`,
      });
    }
  }

  const redirectUri =
    process.env.INSTAGRAM_REDIRECT_URI || `${request.nextUrl.origin}/api/auth/instagram/callback`;

  let longLived: { access_token: string; expires_in: number };
  let meta;
  try {
    const short = await exchangeCodeForToken(code, redirectUri);
    // MUST exchange up: ig_refresh_token can only renew already-long-lived tokens,
    // so storing the short-lived one would die in an hour, unrenewably.
    longLived = await exchangeForLongLivedToken(short.access_token);
    // The token is the identity — never trust anything the browser sent.
    meta = await fetchConnectedAccount(longLived.access_token);
  } catch (err) {
    return back(request, { ig_error: `Instagram login failed: ${(err as Error).message}` });
  }

  if (!meta.user_id) return back(request, { ig_error: "Could not resolve an Instagram account." });

  const { data: taken } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id")
    .eq("ig_account_id", meta.user_id)
    .maybeSingle();
  if (taken) return back(request, { ig_error: "That Instagram account is already connected." });

  const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();

  const { error } = await supabaseAdmin.from("instagram_accounts").insert({
    business_id: business.id,
    ig_account_id: meta.user_id, // from Meta, not the request
    username: meta.username,
    name: meta.name,
    profile_picture_url: meta.profile_picture_url,
    access_token: encryptSecret(longLived.access_token),
    token_expires_at: expiresAt, // the paste flow never set this; the cron had to backfill it
    status: isStaff(ctx.user.role) ? "approved" : "pending",
  });
  if (error) return back(request, { ig_error: error.message });

  // Without this the account looks perfectly healthy and never receives a DM.
  // Non-fatal: the account is connected either way, so report it rather than
  // unwinding a successful connect.
  let warning: string | null = null;
  try {
    await subscribeToWebhooks(longLived.access_token);
  } catch (err) {
    warning = `Connected, but subscribing to messages failed: ${(err as Error).message}`;
  }

  return back(
    request,
    warning ? { ig_warning: warning } : { ig_connected: meta.username ?? meta.user_id }
  );
}
