import { supabaseAdmin } from "@/lib/supabase";

// Renders the currently-86'd dishes AND the currently-closed outlets for a business into a
// system-prompt block the AI obeys. tenant.ts appends it AFTER the menu, so "overrides the menu"
// lands correctly.
//
// Returns "" on empty OR any error — availability must NEVER break a reply. The active-window math
// is done here in JS (UTC vs now()) rather than in SQL, so a single missing table or a malformed
// row degrades to "no restrictions" instead of throwing.

type DishRow = {
  dish: string;
  outlet: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
};

type OutletRow = {
  outlet: string;
  note: string | null;
  starts_at: string;
  ends_at: string | null;
};

// Display-only, in IST (the app serves India; the rest of the codebase runs UTC).
function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A row is active while it has started and hasn't ended.
function isActive(r: { starts_at: string; ends_at: string | null }, now: number): boolean {
  return (
    new Date(r.starts_at).getTime() <= now &&
    (r.ends_at == null || new Date(r.ends_at).getTime() > now)
  );
}

export async function getUnavailableBlock(businessId: string): Promise<string> {
  try {
    const now = Date.now();

    const [dishesRes, outletsRes] = await Promise.all([
      supabaseAdmin
        .from("unavailable_dishes")
        .select("dish, outlet, note, starts_at, ends_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("unavailable_outlets")
        .select("outlet, note, starts_at, ends_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true }),
    ]);

    const dishes = (dishesRes.error ? [] : ((dishesRes.data ?? []) as DishRow[])).filter((r) =>
      isActive(r, now)
    );
    const outlets = (outletsRes.error ? [] : ((outletsRes.data ?? []) as OutletRow[])).filter((r) =>
      isActive(r, now)
    );

    const sections: string[] = [];

    // Closed outlets first — a closure overrides everything (including any dish lines for that outlet).
    if (outlets.length > 0) {
      const lines = outlets.map((r) => {
        const until = r.ends_at ? `until ${istTime(r.ends_at)}` : "until further notice";
        const note = r.note?.trim() ? ` — ${r.note.trim()}` : "";
        return `- ${r.outlet.trim()} (${until})${note}`;
      });
      sections.push(
        [
          "## Closed Outlets (overrides everything)",
          "These outlets are fully closed right now. Do NOT take reservations, takeaway orders, or bookings for them, and do not suggest visiting them. If a guest asks about one, say that outlet is closed (until the time shown, if any) and offer another outlet if one is open.",
          ...lines,
        ].join("\n")
      );
    }

    if (dishes.length > 0) {
      const lines = dishes.map((r) => {
        const where = r.outlet?.trim() ? r.outlet.trim() : "all outlets";
        const until = r.ends_at ? `until ${istTime(r.ends_at)}` : "until further notice";
        const note = r.note?.trim() ? ` — ${r.note.trim()}` : "";
        return `- ${r.dish} — ${where} (${until})${note}`;
      });
      sections.push(
        [
          "## Temporarily Unavailable (overrides the menu)",
          "These items are 86'd right now. Do NOT offer, recommend, or confirm them. If a guest asks for one, say it's temporarily unavailable today and suggest a similar item. A line applies only to the outlet it names (or to all outlets).",
          ...lines,
        ].join("\n")
      );
    }

    return sections.join("\n\n");
  } catch {
    return "";
  }
}
