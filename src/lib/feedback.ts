// Post-dining feedback DM: when to send it, and what it says. Pure + synchronous — the cron
// (/api/cron/feedback) calls these per reservation.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DELAY_MS = 2 * 60 * 60 * 1000; // send 2h after the reservation time…
const CAP_HOUR = 23;
const CAP_MIN = 55; // …but never later than 11:55pm IST that day.

/**
 * When to send feedback for a reservation, given its UTC `scheduled_at` (the IST dine time).
 * Rule: reservation + 2h, capped at 11:55pm IST of the reservation's day. So an early booking gets it
 * ~2h later (e.g. 7:55pm → 9:55pm) and anything from ~10pm on lands at 11:55pm (e.g. 10:30pm → 11:55pm).
 * Returns the absolute UTC instant.
 */
export function feedbackSendAt(scheduledAtIso: string): Date {
  const schedUtcMs = new Date(scheduledAtIso).getTime();
  // Shift into IST wall-clock: the UTC fields of `ist` now read as the IST clock.
  const ist = new Date(schedUtcMs + IST_OFFSET_MS);
  const sendIstMs = schedUtcMs + IST_OFFSET_MS + DELAY_MS;
  const capIstMs = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    CAP_HOUR,
    CAP_MIN
  );
  const finalIstMs = Math.min(sendIstMs, capIstMs);
  return new Date(finalIstMs - IST_OFFSET_MS); // back to UTC
}

/** The thank-you message, with the brand's public handle to tag (falls back to no handle if unset). */
export function feedbackMessage(handle: string | null | undefined): string {
  const h = handle?.trim();
  const at = h ? (h.startsWith("@") ? h : `@${h}`) : null;
  const share = at ? `tagging us ${at} or writing to us` : "writing to us";
  return `Hey, thank you for dining with us! You can always share your experience by ${share} — these small gestures keep us motivated. 💛`;
}
