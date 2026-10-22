/** In-memory sliding-window limit per IP (single instance; resets on deploy). */
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

export function rateLimit(ip: string, max = Number(process.env.RATE_LIMIT_PER_10_MIN) || 30, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(ip, recent);
    return { ok: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimit() {
  hits.clear();
}
