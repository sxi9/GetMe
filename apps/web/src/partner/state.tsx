// Partner-side state: open requests, the active job, earnings, chat unread.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Message, Order } from '@getme/core';
import { ACTIVE, OPEN, haversineKm } from '@getme/core';
import { api, post } from '../lib/api';
import { useEvent, useStore } from '../lib/store';

/** The partner projection the API returns (Order minus otp, plus derived fields). */
export interface PView extends Omit<Order, 'otp'> {
  customerName: string; distKm: number | null; etaMin: number | null; legKm: number; earn: number;
  myOffer: Order['offers'][number] | null; myCounter: Order['counter']; declinedByMe: boolean;
  bill: { items: number | null; known: boolean; fees: number; total: number; totalLabel: string; itemsLabel: string };
  shopStatus: string | null; courierPos: { lat: number; lng: number } | null;
}
export interface Earnings {
  today: number; trips: number; tips: number; hours: string; week: number[]; labels: string[];
  bonus: { trips: number; target: number; amount: number }; balance: number; codDue: number;
  recent: { id: string; label: string; amt: number; t: string }[]; ledger: any[];
}
interface PState {
  requests: Record<string, PView>; active: PView | null; earnings: Earnings | null; messages: Message[]; unread: number;
  declinedExtra: Record<string, boolean>; sim: boolean; gps: 'unknown' | 'ok' | 'unavailable';
  setSim: (v: boolean) => void; refreshEarnings: () => Promise<void>; clearActive: () => void; setMessages: (m: Message[]) => void; markRead: () => void;
  event: (orderId: string, body: Record<string, unknown>) => Promise<PView>; postLocation: (pos: { lat: number; lng: number }) => Promise<void>; myPos: { lat: number; lng: number };
}
const Ctx = createContext<PState | null>(null);
export const FALLBACK_POS = { lat: 12.908, lng: 77.65 }; // HSR Layout, used when the device has no GPS

export function PartnerProvider({ children }: { children: ReactNode }) {
  const { session, setMe, onToastClick } = useStore();
  const me = session!.me; const partner = me.partner!;
  const nav = useNavigate(); const loc = useLocation();
  const [requests, setRequests] = useState<Record<string, PView>>({});
  const [active, setActive] = useState<PView | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [declinedExtra, setDeclinedExtra] = useState<Record<string, boolean>>({});
  const [gps, setGps] = useState<PState['gps']>('unknown');
  const [sim, setSim] = useState(false);
  const locRef = useRef(loc.pathname); locRef.current = loc.pathname;
  const activeRef = useRef(active); activeRef.current = active;
  const reqRef = useRef(requests); reqRef.current = requests;

  const refreshEarnings = useCallback(async () => { try { setEarnings(await api<Earnings>('/api/partner/earnings')); } catch { /* offline */ } }, []);
  const postLocation = useCallback(async (pos: { lat: number; lng: number }) => { try { const p = await post('/api/partner/location', pos); setMe({ partner: p }); } catch { /* ignore */ } }, [setMe]);

  // bootstrap
  useEffect(() => {
    api('/api/bootstrap').then(b => {
      setRequests(Object.fromEntries((b.requests as PView[]).map(r => [r.id, r])));
      setActive(b.active ?? null); setEarnings(b.earnings ?? null);
      if (b.active) api<Message[]>(`/api/orders/${b.active.id}/messages`).then(setMessages).catch(() => {});
    }).catch(() => {});
  }, []);

  const absorb = useCallback((o: PView) => {
    if (o.courierId === partner.id) {
      setActive(prev => { if (!prev || prev.id !== o.id) api<Message[]>(`/api/orders/${o.id}/messages`).then(setMessages).catch(() => {}); return o; });
      setRequests(r => { if (!(o.id in r)) return r; const { [o.id]: _, ...rest } = r; return rest; });
      if (o.status === 'delivered') refreshEarnings();
      return;
    }
    const prev = reqRef.current[o.id];
    const open = OPEN.has(o.status) && !o.courierId && !o.declinedByMe && (o.mode !== 'choose' || o.chosenId === partner.id);
    if (prev?.myCounter && !o.myCounter && o.status === 'requesting' && !o.courierId) setDeclinedExtra(d => ({ ...d, [o.id]: true }));
    if (o.myCounter) setDeclinedExtra(d => { if (!d[o.id]) return d; const { [o.id]: _, ...rest } = d; return rest; });
    setRequests(r => { if (open) return { ...r, [o.id]: o }; if (!(o.id in r)) return r; const { [o.id]: _, ...rest } = r; return rest; });
    if (activeRef.current?.id === o.id && !ACTIVE.has(o.status) && o.status !== 'delivered') setActive(null);
  }, [partner.id, refreshEarnings]);

  useEvent(ev => {
    if (ev.type === 'order.created' || ev.type === 'order.updated') absorb(ev.order as unknown as PView);
    else if (ev.type === 'order.gone') setRequests(r => { const { [ev.orderId]: _, ...rest } = r; return rest; });
    else if (ev.type === 'message.sent') { const m = ev.message; if (activeRef.current?.id === m.orderId) { setMessages(ms => ms.some(x => x.id === m.id) ? ms : [...ms, m]); if (m.from === 'customer' && !locRef.current.endsWith('/job/chat')) setUnread(u => u + 1); } }
    else if (ev.type === 'order.completed') refreshEarnings();
  }, [absorb]);

  useEffect(() => { onToastClick.current = (orderId) => { if (!orderId) return; if (activeRef.current?.id === orderId) nav('/partner/job'); else if (reqRef.current[orderId]) nav(`/partner/request/${orderId}`); else nav('/partner'); }; return () => { onToastClick.current = null; }; }, [nav, onToastClick]);

  // real GPS when online
  useEffect(() => {
    if (!partner.online) return;
    if (!('geolocation' in navigator)) { setGps('unavailable'); return; }
    let last = 0;
    const id = navigator.geolocation.watchPosition(p => { setGps('ok'); const t = Date.now(); if (t - last > 4000) { last = t; postLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); } }, () => setGps('unavailable'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [partner.online, postLocation]);
  // no GPS: make sure the partner has a position so requests reach them, and default to simulated movement
  useEffect(() => { if (gps === 'unavailable') { setSim(true); if (partner.online && !partner.pos) postLocation(FALLBACK_POS); } }, [gps, partner.online, partner.pos, postLocation]);
  // simulated movement toward the current target
  useEffect(() => {
    if (!sim || !active || !(active.status === 'to_shop' || active.status === 'to_customer')) return;
    const target = active.status === 'to_shop' ? (active.shopPos ?? active.pickup ?? active.address) : active.address;
    const t = window.setInterval(() => {
      const cur = partner.pos ?? FALLBACK_POS;
      if (haversineKm(cur, target) < 0.04) return;
      postLocation({ lat: cur.lat + (target.lat - cur.lat) * 0.12, lng: cur.lng + (target.lng - cur.lng) * 0.12 });
    }, 1500);
    return () => window.clearInterval(t);
  }, [sim, active?.id, active?.status, partner.pos, postLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const event = useCallback(async (orderId: string, body: Record<string, unknown>) => { const o = await post<PView>(`/api/orders/${orderId}/events`, body); absorb(o); return o; }, [absorb]);
  const clearActive = useCallback(() => { setActive(null); setMessages([]); setUnread(0); }, []);
  const markRead = useCallback(() => setUnread(0), []);
  const value = useMemo<PState>(() => ({ requests, active, earnings, messages, unread, declinedExtra, sim, gps, setSim, refreshEarnings, clearActive, setMessages, markRead, event, postLocation, myPos: partner.pos ?? FALLBACK_POS }), [requests, active, earnings, messages, unread, declinedExtra, sim, gps, refreshEarnings, clearActive, markRead, event, postLocation, partner.pos]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function usePartner() { const s = useContext(Ctx); if (!s) throw new Error('PartnerProvider missing'); return s; }

export const PHASE: Record<string, string> = { to_shop: 'Heading to the shop', shopping: 'At the shop', to_customer: 'Delivering', arrived: 'Handover', delivered: 'Delivered' };
export const PHASE_PARCEL: Record<string, string> = { to_shop: 'Heading to the pickup', shopping: 'At the pickup', to_customer: 'Delivering to the receiver', arrived: 'Handover', delivered: 'Delivered' };
export const phaseLabel = (o: PView) => (o.kind === 'parcel' ? PHASE_PARCEL : PHASE)[o.status] ?? o.status;
export const itemsLabel = (o: PView) => o.kind === 'parcel' ? `${o.pkType ?? 'Package'} · ${o.pkSize ?? ''}`.trim() : o.kind === 'shop' ? `${o.items.length} item${o.items.length > 1 ? 's' : ''} packed by the shop · ₹${o.itemsTotal ?? 0}` : `${o.items.length} item${o.items.length > 1 ? 's' : ''} to buy · ${o.items.map(i => i.name).slice(0, 3).join(', ')}${o.items.length > 3 ? '…' : ''}`;
export const fmtKm = (km: number | null | undefined) => km == null ? '' : km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km';
export const navigateTo = (p: { lat: number; lng: number }) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`, '_blank', 'noopener');
