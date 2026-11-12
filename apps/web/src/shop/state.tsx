import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Announcement, Community, Shop } from '@getme/core';
import { api } from '../lib/api';
import { useEvent, useStore } from '../lib/store';

export interface ShopOrderView {
  id: string; kind: string; customerName: string; items: { name: string; qty: number; unit?: string; substitute?: string | null; unavailable?: boolean }[];
  itemsTotal: number | null; status: string; shopStatus: string | null; courierName: string | null; createdAt: string; times: Record<string, string | undefined>; note: string; subs: boolean;
  run?: { id: string; label: string; destination: string; departAt: string; status: string } | null;
}
export interface Analytics {
  orders: number; revenue: number; avgPrep: number; week: number[]; labels: string[]; top: { name: string; n: number }[]; split: number; settlement: number; lowStock: number;
}
export interface Board { community: Community; announcements: Announcement[]; runs: any[]; members: { id: string; name: string; role: string; photoUrl: string | null }[] }
interface ShopState {
  shop: Shop | null;
  community: Community | null;
  orders: ShopOrderView[];
  analytics: Analytics | null;
  board: Board | null;
  loading: boolean;
  refreshOrders: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  refreshBoard: () => Promise<void>;
  setShop: (s: Shop) => void;
  setCommunity: (c: Community | null) => void;
}
const Ctx = createContext<ShopState | null>(null);

export function ShopStateProvider({ children }: { children: ReactNode }) {
  const { session, setMe } = useStore();
  const [orders, setOrders] = useState<ShopOrderView[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const analyticsTimer = useRef<number | undefined>(undefined);

  const refreshOrders = useCallback(async () => { try { setOrders(await api<ShopOrderView[]>('/api/shop/orders')); } catch { /* keep last */ } }, []);
  const refreshAnalytics = useCallback(async () => { try { setAnalytics(await api<Analytics>('/api/shop/analytics')); } catch { /* keep last */ } }, []);
  const refreshBoard = useCallback(async () => { try { setBoard(await api<Board | null>('/api/community/board')); } catch { /* keep last */ } }, []);
  const setShop = useCallback((s: Shop) => setMe({ shop: s }), [setMe]);
  const setCommunity = useCallback((c: Community | null) => { setMe({ community: c } as any); if (!c) setBoard(null); else void refreshBoard(); }, [setMe, refreshBoard]);

  useEffect(() => {
    let alive = true;
    api('/api/bootstrap').then(b => { if (!alive) return; setOrders(b.orders ?? []); setAnalytics(b.analytics ?? null); if (b.me?.shop) setMe({ shop: b.me.shop, community: b.me.community ?? null } as any); if (b.me?.community) void refreshBoard(); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [setMe, refreshBoard]);

  useEvent(ev => {
    if (ev.type === 'order.created' || ev.type === 'order.updated') {
      const o = ev.order as unknown as ShopOrderView;
      setOrders(prev => { const i = prev.findIndex(x => x.id === o.id); if (i < 0) return [o, ...prev]; const next = prev.slice(); next[i] = o; return next; });
      window.clearTimeout(analyticsTimer.current); analyticsTimer.current = window.setTimeout(refreshAnalytics, 400);
    }
    if (ev.type === 'order.gone') setOrders(prev => prev.filter(x => x.id !== ev.orderId));
    if (ev.type === 'announcement') setBoard(b => b ? { ...b, announcements: [ev.announcement, ...b.announcements.filter(a => a.id !== ev.announcement.id)] } : b);
    if (ev.type === 'run.updated') setBoard(b => b ? { ...b, runs: b.runs.some(r => r.id === ev.run.id) ? b.runs.map(r => r.id === ev.run.id ? { ...r, ...ev.run } : r) : [ev.run, ...b.runs] } : b);
  });

  const community = ((session?.me as any)?.community ?? null) as Community | null;
  const value = useMemo<ShopState>(() => ({ shop: session?.me.shop ?? null, community, orders, analytics, board, loading, refreshOrders, refreshAnalytics, refreshBoard, setShop, setCommunity }), [session?.me.shop, community, orders, analytics, board, loading, refreshOrders, refreshAnalytics, refreshBoard, setShop, setCommunity]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useShop() { const s = useContext(Ctx); if (!s) throw new Error('ShopStateProvider missing'); return s; }

export const lowStock = (shop: Shop | null) => (shop?.items ?? []).filter(i => i.stock <= 3);
export const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
