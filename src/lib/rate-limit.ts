// Lightweight in-memory rate limiter (fixed window). Good enough to blunt
// abusive bursts on a single serverless instance.
//
// NOTE: serverless deployments run multiple isolated instances, so this is
// best-effort, not a global guarantee. For strict global limits, swap this for
// a shared store like Upstash Redis (@upstash/ratelimit). See DEPLOYMENT.md.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

// Occasionally purge expired buckets so the map doesn't grow unbounded.
export function sweepRateLimiter() {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}
