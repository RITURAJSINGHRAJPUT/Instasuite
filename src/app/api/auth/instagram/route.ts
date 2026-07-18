import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { getContext } from "@/lib/ownership";
import { can, isStaff } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase";
import { instagramAuthUrl } from "@/lib/instagram";

/**
 * Start Instagram Business Login.
 *
 * This is what makes App Review possible: a Meta reviewer can complete it with
 * their own test account, which they could never do with the hand-pasted token
 * flow. It also removes the tester-invite dance from ONBOARDING.md.
 *
 * The proxy gates this route, so a session is guaranteed. The return leg is a
 * top-level GET navigation from instagram.com, so the SameSite=Lax auth cookie
 * rides along and the callback still knows who the user is.
 */
export function redirectUri(request: NextRequest): string {
  // Explicit env wins: the value must match a Valid OAuth Redirect URI in the
  // Meta dashboard EXACTLY, and deriving it from the Host header would silently
  // drift (ngrok vs localhost vs prod) and fail with an unhelpful Meta error.
  return process.env.INSTAGRAM_REDIRECT_URI || `${request.nextUrl.origin}/api/auth/instagram/callback`;
}

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(ctx.user.role, "businesses")) return Response.json({ error: "Not found" }, { status: 404 });

  if (!process.env.INSTAGRAM_APP_ID || !process.env.META_APP_SECRET) {
    return Response.json(
      { error: "Instagram login isn't configured. Set INSTAGRAM_APP_ID and META_APP_SECRET." },
      { status: 500 }
    );
  }

  const businessId = request.nextUrl.searchParams.get("business_id") ?? "";
  if (!businessId) return Response.json({ error: "business_id is required" }, { status: 400 });

  // Ownership is checked HERE, before we hand control to Meta — the callback
  // re-checks it too, but failing early gives a real error instead of a confusing
  // one after a round trip.
  let bq = supabaseAdmin.from("businesses").select("id").eq("id", businessId);
  if (!isStaff(ctx.user.role)) bq = bq.eq("client_id", ctx.user.id);
  const { data: business } = await bq.maybeSingle();
  if (!business) return Response.json({ error: "Not found" }, { status: 404 });

  // CSRF: an unguessable value echoed back by Meta and compared against an
  // HttpOnly cookie. Without it, an attacker could hand a victim a crafted
  // callback URL and graft their own Instagram account onto the victim's business.
  const state = randomBytes(32).toString("base64url");

  const res = Response.redirect(instagramAuthUrl(state, redirectUri(request)), 302);
  const headers = new Headers(res.headers);
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  // Lax (not Strict): the callback arrives via a cross-site top-level navigation,
  // and Strict would withhold the cookie exactly when we need it.
  headers.append(
    "Set-Cookie",
    `ig_oauth_state=${state}; Path=/api/auth/instagram; HttpOnly; SameSite=Lax${secure}; Max-Age=600`
  );
  headers.append(
    "Set-Cookie",
    `ig_oauth_business=${businessId}; Path=/api/auth/instagram; HttpOnly; SameSite=Lax${secure}; Max-Age=600`
  );
  return new Response(null, { status: 302, headers });
}
