import dns from "node:dns";

// Prefer IPv4: Meta's Graph API resolves to both IPv4 and IPv6, and on some
// networks the IPv6 route hangs until the connect timeout. Trying IPv4 first
// avoids the intermittent ConnectTimeoutError seen in the webhook.
dns.setDefaultResultOrder("ipv4first");

export interface InstagramProfile {
  name: string | null;
  username: string | null;
  profile_pic: string | null;
  follower_count: number | null;
  is_user_follow_business: boolean | null;
  is_business_follow_user: boolean | null;
}

// fetch with a hard timeout and one retry, so a single slow/failed connection
// to Meta doesn't stall (or drop) message handling.
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 8000, retries = 1 } = {}
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastErr = err;
      console.warn(`Instagram API fetch failed (attempt ${attempt + 1}):`, (err as Error).message);
    }
  }
  throw lastErr;
}

export async function fetchInstagramProfile(
  igsid: string,
  accessToken: string
): Promise<InstagramProfile> {
  const empty: InstagramProfile = {
    name: null,
    username: null,
    profile_pic: null,
    follower_count: null,
    is_user_follow_business: null,
    is_business_follow_user: null,
  };

  const url = new URL(`https://graph.instagram.com/v24.0/${igsid}`);
  url.searchParams.set("fields", "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetchWithRetry(url.toString());
    const data = await res.json();
    return {
      name: data.name ?? null,
      username: data.username ?? null,
      profile_pic: data.profile_pic ?? null,
      follower_count: data.follower_count ?? null,
      is_user_follow_business: data.is_user_follow_business ?? null,
      is_business_follow_user: data.is_business_follow_user ?? null,
    };
  } catch (err) {
    // Never let a profile-fetch failure block storing the message / replying.
    console.warn("fetchInstagramProfile failed, using nulls:", (err as Error).message);
    return empty;
  }
}

export interface InstagramAccount {
  user_id: string;
  username: string | null;
  name: string | null;
  account_type: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  media_count: number | null;
}

// The business account a given token belongs to. The token IS the identity:
// /me resolves server-side to whoever owns it.
// Unlike fetchInstagramProfile, this deliberately throws instead of returning
// nulls — the caller surfaces the failure so a bad/expired token is visible.
export async function fetchConnectedAccount(accessToken: string): Promise<InstagramAccount> {
  if (!accessToken) throw new Error("No Instagram access token supplied.");

  const url = new URL("https://graph.instagram.com/v24.0/me");
  url.searchParams.set(
    "fields",
    "user_id,username,name,account_type,profile_picture_url,followers_count,media_count"
  );
  url.searchParams.set("access_token", accessToken);

  const res = await fetchWithRetry(url.toString());
  const data = await res.json();

  // fetchWithRetry resolves for any status, so check explicitly rather than
  // letting a Graph error (e.g. code 190, expired token) become empty fields.
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Instagram API returned ${res.status}`);
  }

  return {
    user_id: String(data.user_id ?? ""),
    username: data.username ?? null,
    name: data.name ?? null,
    account_type: data.account_type ?? null,
    profile_picture_url: data.profile_picture_url ?? null,
    followers_count: data.followers_count ?? null,
    media_count: data.media_count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Instagram Business Login (OAuth)
//
// Replaces hand-pasted tokens. Note the credential mapping, which is the thing
// that trips everyone up: client_id is the *Instagram* app ID and client_secret
// is the *Instagram* app secret — NOT the Facebook app's pair from
// App settings -> Basic. The same Instagram secret also signs the webhooks, which
// is why META_APP_SECRET is reused here rather than a second variable.
// ---------------------------------------------------------------------------

export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

export function instagramAuthUrl(state: string, redirectUri: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", IG_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

/** Authorization code -> short-lived token (~1 hour). */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; user_id: string }> {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.META_APP_SECRET!, // the Instagram app secret
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetchWithRetry("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok || data.error || data.error_message) {
    throw new Error(data?.error_message || data?.error?.message || `Token exchange returned ${res.status}`);
  }
  if (!data.access_token) throw new Error("Token exchange response had no access_token.");
  return { access_token: data.access_token, user_id: String(data.user_id ?? "") };
}

/**
 * Short-lived -> long-lived (~60 days).
 *
 * Not optional. refreshInstagramToken() below uses ig_refresh_token, which only
 * renews tokens that are ALREADY long-lived — so skipping this step yields an
 * account that works for an hour and then dies with no way to renew it.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetchWithRetry(url.toString());
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Long-lived exchange returned ${res.status}`);
  }
  if (!data.access_token) throw new Error("Long-lived exchange response had no access_token.");
  // expires_in is documented as ~60 days; default defensively rather than storing NaN.
  return { access_token: data.access_token, expires_in: Number(data.expires_in ?? 60 * 86400) };
}

/**
 * Subscribe the account to `messages` webhooks.
 *
 * Nothing did this before: @sparshnfc was subscribed by hand, so a second account
 * could connect, look healthy, and silently never receive a DM. Idempotent —
 * re-subscribing an already-subscribed account is a no-op.
 */
export async function subscribeToWebhooks(accessToken: string): Promise<void> {
  const url = new URL("https://graph.instagram.com/v24.0/me/subscribed_apps");
  url.searchParams.set("subscribed_fields", "messages");
  url.searchParams.set("access_token", accessToken);

  const res = await fetchWithRetry(url.toString(), { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Webhook subscribe returned ${res.status}`);
  }
}

/**
 * Extend a long-lived Instagram token by another ~60 days.
 *
 * Instagram long-lived tokens expire after 60 days. Nothing refreshed them, so
 * every connected account was a silent time-bomb: the token dies, replies stop,
 * and the only symptom is a 190 in the logs.
 *
 * Meta requires the token to be at least 24h old and still valid. Returns a NEW
 * token string — the caller must persist it (and should verify it first).
 */
export async function refreshInstagramToken(
  accessToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const res = await fetchWithRetry(url.toString());
  const data = await res.json();

  // fetchWithRetry resolves on any status — surface Graph errors explicitly.
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Instagram API returned ${res.status}`);
  }
  if (!data.access_token || !data.expires_in) {
    throw new Error("Refresh response was missing access_token/expires_in.");
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

// The token decides which account the reply is sent FROM — /me is resolved from it.
export async function sendInstagramMessage(
  recipientIgsid: string,
  text: string,
  accessToken: string
) {
  const url = new URL("https://graph.instagram.com/v24.0/me/messages");
  url.searchParams.set("access_token", accessToken);

  const res = await fetchWithRetry(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      message: { text },
    }),
  });
  return res.json();
}
