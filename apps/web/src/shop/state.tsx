import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Shop } from '@getme/core';
import { api } from '../lib/api';
import { useEvent, useStore } from '../lib/store';

export interface ShopOrderView {
  id: string; kind: string; customerName: string; items: { name: string; qty: number; unit?: string; substitute?: string | null; unavailable?: boolean }[];
  itemsTotal: number | null; status: string; shopStatus: string | null; courierName: string | null; createdAt: string; times: Record<string, string | undefined>; note: string; subs: boolean;
}
export interface Analytics {
  orders: number; revenue: number; avgPrep: number; week: number[]; labels: string[]; top: { name: string; n: number }[]; split: number; settlement: number; lowStock: number;
}
interface ShopState {
  shop: Shop | null;
  orders: ShopOrderView[];
  analytics: Analytics | null;
  loading: boolean;
  refreshOrders: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  setShop: (s: Shop) => void;
}
const Ctx = createContext<ShopState | null>(null);

export function ShopStateProvider({ children }: { children: ReactNode }) {
  const { session, setMe } = useStore();
  const [orders, setOrders] = useState<ShopOrderView[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const analyticsTimer = useRef<number | undefined>(undefined);

  const refreshOrders = useCallback(async () => { try { setOrders(await api<ShopOrderView[]>('/api/shop/orders')); } catch { /* keep last */ } }, []);
  const refreshAnalytics = useCallback(async () => { try { setAnalytics(await api<Analytics>('/api/shop/analytics')); } catch { /* keep last */ } }, []);
  const setShop = useCallback((s: Shop) => setMe({ shop: s }), [setMe]);

  useEffect(() => {
    let alive = true;
    api('/api/bootstrap').then(b => { if (!alive) return; setOrders(b.orders ?? []); setAnalytics(b.analytics ?? null); if (b.me?.shop) setMe({ shop: b.me.shop }); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [setMe]);

  useEvent(ev => {
    if (ev.type === 'order.created' || ev.type === 'order.updated') {
      const o = ev.order as unknown as ShopOrderView;
      setOrders(prev => { const i = prev.findIndex(x => x.id === o.id); if (i < 0) return [o, ...prev]; const next = prev.slice(); next[i] = o; return next; });
      window.clearTimeout(analyticsTimer.current); analyticsTimer.current = window.setTimeout(refreshAnalytics, 400);
    }
    if (ev.type === 'order.gone') setOrders(prev => prev.filter(x => x.id !== ev.orderId));
  });

  const value = useMemo<ShopState>(() => ({ shop: session?.me.shop ?? null, orders, analytics, loading, refreshOrders, refreshAnalytics, setShop }), [session?.me.shop, orders, analytics, loading, refreshOrders, refreshAnalytics, setShop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useShop() { const s = useContext(Ctx); if (!s) throw new Error('ShopStateProvider missing'); return s; }

export const lowStock = (shop: Shop | null) => (shop?.items ?? []).filter(i => i.stock <= 3);
export const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
