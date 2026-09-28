import { IncomingHttpHeaders } from 'http';

/** Pages that are allowed to open a signaling socket or POST /log. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://games.kankawabata.com',
  'https://kkawabat.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const MAX_KEYS = 10_000;

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const times = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (times.length >= this.max) {
      this.hits.set(key, times);
      return false;
    }
    times.push(now);
    this.hits.set(key, times);
    if (this.hits.size > MAX_KEYS) this.evict();
    return true;
  }

  private evict(): void {
    const extra = this.hits.size - MAX_KEYS;
    const keys = this.hits.keys();
    for (let i = 0; i < extra; i += 1) {
      const key = keys.next().value;
      if (key !== undefined) this.hits.delete(key);
    }
  }
}

/** Last X-Forwarded-For hop is the one Cloud Run appends and clients cannot spoof. */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress?: string): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) {
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || 'unknown';
  }
  return remoteAddress || 'unknown';
}

export function parseOrigins(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  const listed = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  return listed.length ? listed : fallback;
}

/**
 * When `enforce` is false (local tests, no K_SERVICE), any origin is fine.
 * Missing Origin is rejected only under enforce — browsers always send it.
 */
export function originAllowed(
  origin: string | undefined,
  allowed: string[],
  enforce: boolean
): boolean {
  if (!enforce) return true;
  if (!origin) return false;
  return allowed.includes(origin);
}
