import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Community, Partner, RegionProfile, Shop } from '@getme/core';
import { api } from '../lib/api';
import { useEvent } from '../lib/store';

export interface Overview {
  live: any[]; pendingPartners: Partner[]; pendingShops: Shop[]; refunds: any[]; partnersOnline: number; partners: number; ordersToday: number;
  runs: any[]; regions: RegionProfile[]; sms: { phone: string; text: string; at: string; provider: string }[]; communities: Community[];
}
interface AdminState { overview: Overview | null; loading: boolean; refresh: () => Promise<void> }
const Ctx = createContext<AdminState | null>(null);

export function AdminStateProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const refresh = useCallback(async () => { try { setOverview(await api<Overview>('/api/admin/overview')); } catch { /* keep last */ } }, []);
  useEffect(() => {
    let alive = true;
    api('/api/bootstrap').then(b => { if (alive && b.overview) setOverview(b.overview); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  useEvent(ev => {
    if (ev.type === 'order.updated' || ev.type === 'order.created' || ev.type === 'notify' || ev.type === 'run.updated' || ev.type === 'partner.updated' || ev.type === 'shop.updated') {
      window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void refresh(); }, 500);
    }
  });
  const value = useMemo<AdminState>(() => ({ overview, loading, refresh }), [overview, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAdmin() { const s = useContext(Ctx); if (!s) throw new Error('AdminStateProvider missing'); return s; }

export const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
export const maskPhone = (p: string) => (p ? '•••• ' + p.slice(-4) : '—');
