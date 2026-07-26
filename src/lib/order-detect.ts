import crypto from "node:crypto";

// Detects the structured "handoff line" the AI appends when it finalizes a reservation or
// takeaway, so the webhook can (a) strip it from what the guest sees and (b) capture a real
// order row. Pure and synchronous — it runs in the reply path and must never throw.
//
// Reservation line (pipe-delimited; the script instructs the AI to emit exactly this):
//   RESERVATION | Outlet: <outlet> | Name: <name> | Date: <date> | Time: <time> | Guests: <n> | Contact: <number or ->
// Takeaway line (existing "Team Handoff Note Format" in the script):
//   TAKEAWAY [Outlet]–[City] / [Items] / Name:<name> | Contact:<number> | Pickup:<time>

const RESERVATION_RE = /^[ \t]*RESERVATION\s*\|.*$/im;
const TAKEAWAY_RE = /^[ \t]*TAKEAWAY\b.*$/im;
// Non-order handoff: anything that needs a human (collab/complaint/billing/event/other).
//   REVIEW | Type: <collaboration|complaint|billing|event|other> | Name: <name or -> | Contact: <number or -> | Summary: <one line>
const REVIEW_RE = /^[ \t]*REVIEW\s*\|.*$/im;

export type OrderKind = "reservation" | "takeaway";
export type DetectedOrder = {
  kind: OrderKind;
  /** The exact handoff line (used for the dedupe key). */
  line: string;
  /** Guest name parsed from the line, if present. */
  customer: string | null;
  /** A clean, human-readable summary for the dashboard + confirmation message. */
  summary: string;
  /** The reservation/pickup time as a UTC ISO string (from the `At:` field), or null. */
  scheduledAt: string | null;
};

/** The known review buckets. Free-text `Type:` is normalised to one of these; anything else → "other". */
export type ReviewCategory = "collaboration" | "complaint" | "billing" | "event" | "other";
export type DetectedReview = {
  /** The exact handoff line (used for the dedupe key). */
  line: string;
  /** Normalised bucket parsed from the line's `Type:` field. */
  category: ReviewCategory;
  /** Guest name parsed from the line, if present. */
  customer: string | null;
  /** A clean, human-readable summary for the dashboard. */
  summary: string;
};

// Map the AI's free-text `Type:` onto a known bucket. Substring match so "paid collab" → collaboration,
// "payment issue" → billing, etc.; unrecognised (or missing) falls back to "other".
function normalizeCategory(type: string | undefined): ReviewCategory {
  const t = (type || "").toLowerCase();
  if (/collab|partner|promo|sponsor/.test(t)) return "collaboration";
  if (/complain|issue|problem|refund|angry/.test(t)) return "complaint";
  if (/bill|payment|invoice|charge/.test(t)) return "billing";
  if (/event|party|large group|group booking|catering/.test(t)) return "event";
  return "other";
}

// Parse `Key: value | Key: value` pairs out of a line. The reservation line is fully
// pipe-delimited so this yields every field; the takeaway line only partially matches
// (brackets/slashes break the key), which is fine — its customer falls back to the profile.
function parseFields(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of line.split("|")) {
    const m = part.match(/^\s*([A-Za-z ]+?)\s*:\s*(.+?)\s*$/);
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return out;
}

// Parse the `At:` field ("YYYY-MM-DD HH:MM", an IST wall-clock the AI computed) into a UTC
// ISO string, so the Inbox can tell when the reservation/pickup time has passed. Returns null
// if absent or unparseable — such an order never counts as "completed".
function parseIstToUtc(at: string | undefined): string | null {
  if (!at) return null;
  const m = at.match(/^\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  // IST = UTC+5:30 — subtract to get the UTC instant of that wall-clock time.
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi) - 5.5 * 3600 * 1000;
  const dt = new Date(utcMs);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function detectHandoff(reply: string): DetectedOrder | null {
  const r = reply.match(RESERVATION_RE);
  if (r) {
    const line = r[0].trim();
    const f = parseFields(line);
    const summary =
      [
        f["outlet"] && `Outlet: ${f["outlet"]}`,
        f["date"] && `Date: ${f["date"]}`,
        f["time"] && `Time: ${f["time"]}`,
        f["guests"] && `Guests: ${f["guests"]}`,
        f["contact"] && f["contact"] !== "-" && `Contact: ${f["contact"]}`,
      ]
        .filter(Boolean)
        .join(" · ") || line.replace(/^RESERVATION\s*\|?\s*/i, "").trim();
    return { kind: "reservation", line, customer: f["name"] || null, summary, scheduledAt: parseIstToUtc(f["at"]) };
  }

  const t = reply.match(TAKEAWAY_RE);
  if (t) {
    const line = t[0].trim();
    const f = parseFields(line);
    const summary =
      [
        f["outlet"] && `Outlet: ${f["outlet"]}`,
        f["items"] && `Items: ${f["items"]}`,
        f["pickup"] && `Pickup: ${f["pickup"]}`,
        f["contact"] && f["contact"] !== "-" && `Contact: ${f["contact"]}`,
      ]
        .filter(Boolean)
        .join(" · ") || line.replace(/^TAKEAWAY\s*\|?\s*/i, "").trim();
    return { kind: "takeaway", line, customer: f["name"] || null, summary, scheduledAt: parseIstToUtc(f["at"]) };
  }

  return null;
}

// Detect the REVIEW handoff line (a non-order matter needing a human). Independent of detectHandoff —
// a single reply could in principle carry both, and they go to different tables.
export function detectReview(reply: string): DetectedReview | null {
  const m = reply.match(REVIEW_RE);
  if (!m) return null;
  const line = m[0].trim();
  const f = parseFields(line);
  const summary =
    f["summary"] || line.replace(/^REVIEW\s*\|?\s*/i, "").trim();
  return {
    line,
    category: normalizeCategory(f["type"]),
    customer: f["name"] && f["name"] !== "-" ? f["name"] : null,
    summary,
  };
}

// Remove the handoff line(s) from the reply so the guest sees only the clean confirmation.
export function stripHandoff(reply: string): string {
  return reply
    .replace(RESERVATION_RE, "")
    .replace(TAKEAWAY_RE, "")
    .replace(REVIEW_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Backs the orders.dedupe_key unique constraint — a verbatim re-emission collapses to one
// order; an edited one (different line) captures anew.
export function dedupeKey(kind: string, conversationId: string, line: string): string {
  const hash = crypto.createHash("sha1").update(line).digest("hex");
  return `${kind}:${conversationId}:${hash}`;
}
