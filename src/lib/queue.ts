// Bounded concurrency for webhook processing.
//
// Meta delivers each DM as a separate webhook, and each one used to fire an
// unbounded background task straight into an AI call. A burst of 50 DMs meant 50
// concurrent Claude calls: rate limits, timeouts, and dropped replies — the
// system got *worse* under load instead of slower.
//
// This is an in-process gate, so it bounds one server instance. Multiple
// instances need a shared queue (Redis/pg-boss) — noted, not solved here.

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_REPLIES || 4);

let active = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight over; `active` stays the same
  else active--;
}

/** Run `task` once a concurrency slot is free. Queued, never dropped. */
export async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}

export function queueStats() {
  return { active, waiting: waiting.length, max: MAX_CONCURRENT };
}

/**
 * Retry on transient failures (429 rate limit, 5xx) with exponential backoff.
 * A rate limit is "try again shortly", not "this customer gets no reply".
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  { retries = 2, baseMs = 1000 } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const transient = status === 429 || (typeof status === "number" && status >= 500);
      if (!transient || attempt === retries) throw err;
      const delay = baseMs * 2 ** attempt;
      console.warn(`Transient failure (${status}), retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
