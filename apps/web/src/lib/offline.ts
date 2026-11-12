// Offline queue for order events: when the network is down, mutations are kept
// in localStorage with an idempotency key and replayed in order once online.
// The server ignores keys it has already applied, so replays are safe.
import { api, ApiError } from './api';

export interface Queued { id: string; path: string; body: unknown; key: string; at: number; label: string }
const KEY = 'getme.offline.queue';
const read = (): Queued[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const write = (q: Queued[]) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* ignore */ } };
const listeners = new Set<(q: Queued[]) => void>();
const emit = () => { const q = read(); listeners.forEach(l => l(q)); };
export const onQueue = (l: (q: Queued[]) => void) => { listeners.add(l); l(read()); return () => { listeners.delete(l); }; };
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** POST now, or queue when offline / network error. Throws ApiError for real server rejections. */
export async function postOrQueue<T = any>(path: string, body: unknown, label: string): Promise<{ queued: true } | { queued: false; result: T }> {
  const key = newKey();
  if (!isOnline()) { enqueue({ id: key, path, body, key, at: Date.now(), label }); return { queued: true }; }
  try {
    const result = await api<T>(path, { method: 'POST', body: { ...(body as object), idempotencyKey: key } });
    return { queued: false, result };
  } catch (e) {
    if (e instanceof ApiError) throw e; // server answered: not a connectivity problem
    enqueue({ id: key, path, body, key, at: Date.now(), label }); return { queued: true };
  }
}
function enqueue(q: Queued) { write([...read(), q]); emit(); }

let flushing = false;
export async function flush(): Promise<number> {
  if (flushing || !isOnline()) return 0;
  flushing = true; let done = 0;
  try {
    for (const q of read()) {
      try { await api(q.path, { method: 'POST', body: { ...(q.body as object), idempotencyKey: q.key } }); }
      catch (e) { if (!(e instanceof ApiError)) break; /* server rejected: drop it (state moved on) */ }
      write(read().filter(x => x.id !== q.id)); done++; emit();
    }
  } finally { flushing = false; }
  return done;
}
if (typeof window !== 'undefined') { window.addEventListener('online', () => { void flush(); }); setInterval(() => { if (read().length) void flush(); }, 15_000); }
