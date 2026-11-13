// Request hardening helpers: in-memory rate limiting, OTP attempt counting,
// input clamps, and an allowlist for Web Push endpoints. In-memory state is
// per process; put these counters in Redis when the API runs on more than one
// instance.
import { DomainError } from '@getme/core';

type Bucket = { hits: number[]; };
const buckets = new Map<string, Bucket>();
/** Sliding-window limiter: allow `max` hits per `windowMs` for `key`. Throws DomainError('rate_limited'). */
export function rateLimit(key: string, max: number, windowMs: number, what = 'requests') {
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter(t => now - t < windowMs);
  if (b.hits.length >= max) throw new DomainError('rate_limited', `Too many ${what}. Try again in a few minutes`);
  b.hits.push(now); buckets.set(key, b);
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) { b.hits = b.hits.filter(t => now - t < 15 * 60_000); if (!b.hits.length) buckets.delete(k); } }, 60_000).unref();

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 3600_000;

/** Clamp free text: trim, strip control characters, cap length. */
export function text(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s.length > max ? s.slice(0, max) : s;
}
export function num(v: unknown, min: number, max: number, fallback: number | null = null): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T { return (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback; }
export function latLng(v: any): { lat: number; lng: number } | null {
  const lat = num(v?.lat, -90, 90), lng = num(v?.lng, -180, 180);
  return lat == null || lng == null ? null : { lat, lng };
}
export function requireLatLng(v: any) { const p = latLng(v); if (!p) throw new DomainError('invalid', 'Valid lat/lng required'); return p; }

/** Only real browser push services may be stored as endpoints (the server POSTs to them). */
const PUSH_HOSTS = [/\.googleapis\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/];
export function validPushEndpoint(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && PUSH_HOSTS.some(r => r.test(u.hostname)); } catch { return false; }
}
export const clientIp = (req: { ip: string; headers: Record<string, any> }) => (String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip);
