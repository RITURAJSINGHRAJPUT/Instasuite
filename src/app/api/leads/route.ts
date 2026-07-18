import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// PUBLIC, UNAUTHENTICATED endpoint — the only one besides the Meta webhook, and
// unlike that one there's no signature to check. Treat every input as hostile:
// cap lengths, honeypot the bots, rate-limit per IP, and never let the response
// reveal anything (no echoing input, no "email already exists").

const LIMITS = { name: 120, email: 200, instagram_handle: 60, message: 1000 };
const MAX_BODY_BYTES = 4_000;

// In-process, same trade-off as src/lib/queue.ts: bounds a single instance.
// Multiple instances need a shared store — noted, not solved here.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // crude bound on memory growth
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export async function POST(request: NextRequest) {
  // Identical response on every path so probing tells an attacker nothing.
  const ok = () => Response.json({ ok: true });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Request too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: hidden field no human fills in. Bots do. Look successful and drop it.
  if (typeof body.website === "string" && body.website.trim() !== "") return ok();

  if (rateLimited(clientIp(request))) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const name = str(body.name, LIMITS.name);
  const email = str(body.email, LIMITS.email);
  const instagram_handle = str(body.instagram_handle, LIMITS.instagram_handle).replace(/^@/, "");
  const message = str(body.message, LIMITS.message);

  if (!name || !email || !looksLikeEmail(email)) {
    return Response.json({ error: "Please provide your name and a valid email." }, { status: 400 });
  }

  // Only whitelisted fields are ever written — status can't be set from outside.
  const { error } = await supabaseAdmin.from("leads").insert({
    name,
    email,
    instagram_handle: instagram_handle || null,
    message: message || null,
  });

  // Log server-side, stay silent to the caller: a DB error must not become an
  // oracle for what's in the table.
  if (error) console.error("Lead insert failed:", error.message);

  return ok();
}
