// Session + realtime store. One WebSocket per signed-in user; events fan out
// to subscribers via useEvent(). Toasts mirror the server's `notify` events.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Community, OrderEvent, Partner, Role, Shop, User } from '@getme/core';
import { api, getToken, setToken, wsUrl } from './api';
import { syncPush } from './push';
import { flush, onQueue, type Queued } from './offline';

export interface Me { user: User; partner: Partner | null; shop: Shop | null; community?: Community | null; wallet?: number; addresses?: any[]; favourites?: string[]; vapidPublicKey?: string }
export interface Session { token: string; me: Me }
type Handler = (ev: OrderEvent) => void;
interface Store {
  session: Session | null;
  signIn: (s: { token: string } & Me) => void;
  signOut: () => void;
  refreshMe: () => Promise<void>;
  setMe: (patch: Partial<Me>) => void;
  toast: (text: string, title?: string, orderId?: string | null, url?: string | null) => void;
  toasts: { id: number; text: string; title: string; orderId: string | null; url: string | null }[];
  dismissToast: (id: number) => void;
  subscribe: (h: Handler) => () => void;
  connected: boolean;
  online: boolean;
  queue: Queued[];
  onToastClick: React.MutableRefObject<((orderId: string | null, url?: string | null) => void) | null>;
}
const Ctx = createContext<Store | null>(null);
const KEY = (role: Role) => 'getme.session.' + role;

export function StoreProvider({ role, children }: { role: Role; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => { try { const raw = localStorage.getItem(KEY(role)); return raw ? JSON.parse(raw) : null; } catch { return null; } });
  const [toasts, setToasts] = useState<Store['toasts']>([]);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [queue, setQueue] = useState<Queued[]>([]);
  useEffect(() => { const on = () => { setOnline(true); void flush(); }, off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); const un = onQueue(setQueue); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); un(); }; }, []);
  const handlers = useRef(new Set<Handler>());
  const onToastClick = useRef<((orderId: string | null, url?: string | null) => void) | null>(null);
  const seq = useRef(0);
  setToken(session?.token ?? null);

  const persist = useCallback((s: Session | null) => { setSession(s); setToken(s?.token ?? null); try { if (s) localStorage.setItem(KEY(role), JSON.stringify(s)); else localStorage.removeItem(KEY(role)); } catch { /* private mode */ } }, [role]);
  const signIn = useCallback((r: { token: string } & Me) => { const { token, ...me } = r; persist({ token, me }); }, [persist]);
  const signOut = useCallback(() => { api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {}); persist(null); }, [persist]);
  const refreshMe = useCallback(async () => { if (!getToken()) return; try { const me = await api<Me>('/api/me'); setSession(s => s ? { ...s, me } : s); } catch (e: any) { if (e.status === 401) persist(null); } }, [persist]);
  const setMe = useCallback((p: Partial<Me>) => setSession(s => s ? { ...s, me: { ...s.me, ...p } } : s), []);
  const toast = useCallback((text: string, title = 'GetMe · now', orderId: string | null = null, url: string | null = null) => { const id = ++seq.current; setToasts(t => [...t.slice(-2), { id, text, title, orderId, url }]); try { if (document.visibilityState === 'visible' && navigator.vibrate && (navigator as any).userActivation?.hasBeenActive) navigator.vibrate(40); } catch { /* ignore */ } }, []);
  const dismissToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  const subscribe = useCallback((h: Handler) => { handlers.current.add(h); return () => { handlers.current.delete(h); }; }, []);

  useEffect(() => { if (session) void syncPush(); }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // websocket lifecycle
  useEffect(() => {
    if (!session) { setConnected(false); return; }
    let ws: WebSocket | null = null, closed = false, retry = 1000, timer: number | undefined;
    const connect = () => {
      ws = new WebSocket(wsUrl('token=' + encodeURIComponent(session.token)));
      ws.onopen = () => { setConnected(true); retry = 1000; refreshMe(); void flush(); };
      ws.onmessage = (m) => {
        let ev: OrderEvent; try { ev = JSON.parse(m.data); } catch { return; }
        if (ev.type === 'notify') toast(ev.body ? `${ev.title} · ${ev.body}` : ev.title, 'GetMe · now', ev.orderId, (ev as any).url ?? null);
        if (ev.type === 'wallet.updated') setSession(s => s ? { ...s, me: { ...s.me, wallet: ev.balance } } : s);
        if (ev.type === 'partner.updated') setSession(s => s ? { ...s, me: { ...s.me, partner: ev.partner } } : s);
        if (ev.type === 'shop.updated') setSession(s => s ? { ...s, me: { ...s.me, shop: ev.shop } } : s);
        handlers.current.forEach(h => { try { h(ev); } catch (e) { console.error(e); } });
      };
      ws.onclose = (e) => { setConnected(false); if (closed) return; if (e.code === 4001) { persist(null); return; } timer = window.setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); };
      ws.onerror = () => ws?.close();
    };
    connect();
    const ping = window.setInterval(() => { if (ws?.readyState === 1) ws.send('{"type":"ping"}'); }, 25000);
    return () => { closed = true; window.clearTimeout(timer); window.clearInterval(ping); ws?.close(); };
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Store>(() => ({ session, signIn, signOut, refreshMe, setMe, toast, toasts, dismissToast, subscribe, connected, online, queue, onToastClick }), [session, signIn, signOut, refreshMe, setMe, toast, toasts, dismissToast, subscribe, connected, online, queue]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStore() { const s = useContext(Ctx); if (!s) throw new Error('StoreProvider missing'); return s; }
/** Subscribe to realtime events for the life of the component. */
export function useEvent(handler: Handler, deps: unknown[] = []) {
  const { subscribe } = useStore();
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => subscribe(ev => ref.current(ev)), [subscribe, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
/** Toast an API error. */
export function useErrorToast() { const { toast } = useStore(); return useCallback((e: unknown) => toast((e as Error)?.message ?? 'Something went wrong', 'Could not do that'), [toast]); }
