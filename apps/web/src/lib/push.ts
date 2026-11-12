// Web Push: register the service worker, subscribe with the server's VAPID key,
// and store the subscription. Safe to call repeatedly; no-ops where unsupported.
import { api, post } from './api';

export function pushSupported() { return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export function pushPermission(): NotificationPermission | 'unsupported' { return pushSupported() ? Notification.permission : 'unsupported'; }

function b64ToU8(b64: string) { const pad = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); }

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch { return null; }
}

/** Ask permission (must be called from a user gesture) and subscribe. Returns the final permission. */
export async function enablePush(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  const reg = (await registerSw()) ?? (await navigator.serviceWorker.ready);
  const { publicKey } = await api<{ publicKey: string | null }>('/api/push/vapid');
  if (!publicKey) return perm;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
  const j = sub.toJSON();
  await post('/api/push/subscribe', { endpoint: sub.endpoint, keys: j.keys });
  return perm;
}
export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}
/** Re-sync an existing subscription after sign-in (permission already granted). */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await registerSw(); const sub = await reg?.pushManager.getSubscription(); if (!sub) return;
  const j = sub.toJSON(); await post('/api/push/subscribe', { endpoint: sub.endpoint, keys: j.keys }).catch(() => {});
}
