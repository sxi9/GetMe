// Partner-side state: open requests, my jobs (single job or a run of several), runs, earnings, chat unread.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Message, Order, Run } from '@getme/core';
import { ACTIVE, OPEN, haversineKm } from '@getme/core';
import { api, post } from '../lib/api';
import { postOrQueue } from '../lib/offline';
import { watchPosition } from '../lib/geo';
import { useEvent, useStore } from '../lib/store';

/** The partner projection the API returns (Order minus otp, plus derived fields). */
export interface PView extends Omit<Order, 'otp'> {
  customerName: string; distKm: number | null; etaMin: number | null; legKm: number; earn: number;
  myOffer: Order['offers'][number] | null; myCounter: Order['counter']; declinedByMe: boolean;
  bill: { items: number | null; known: boolean; fees: number; total: number; totalLabel: string; itemsLabel: string };
  shopStatus: string | null; courierPos: { lat: number; lng: number } | null;
  run: { id: string; label: string; destination: string; departAt: string; status: string } | null;
}
/** A run as the API returns it to its partner. */
export interface RView extends Run {
  partner: { id: string; name: string; initials: string; photoUrl: string | null; rating: number; trips: number; vehicle: string; tier: string } | null;
  seats: number; myOrderIds: string[]; orders?: PView[];
}
export interface Earnings {
  today: number; trips: number; tips: number; hours: string; week: number[]; labels: string[];
  bonus: { trips: number; target: number; amount: number }; balance: number; codDue: number;
  recent: { id: string; label: string; amt: number; t: string }[]; ledger: any[];
}
export type EventResult = { queued: true } | { queued: false; result: PView };
interface PState {
  requests: Record<string, PView>; mine: Record<string, PView>; active: PView | null; activeRun: RView | null; runs: RView[];
  earnings: Earnings | null; messages: Message[]; unread: number;
  declinedExtra: Record<string, boolean>; sim: boolean; gps: 'unknown' | 'ok' | 'unavailable' | 'denied';
  setSim: (v: boolean) => void; refreshEarnings: () => Promise<void>; refreshRuns: () => Promise<void>; clearActive: () => void; setMessages: (m: Message[]) => void; markRead: () => void;
  event: (orderId: string, body: Record<string, unknown>) => Promise<EventResult>; postLocation: (pos: { lat: number; lng: number }) => Promise<void>; myPos: { lat: number; lng: number };
}
const Ctx = createContext<PState | null>(null);
export const FALLBACK_POS = { lat: 12.908, lng: 77.65 }; // HSR Layout, used when the device has no GPS
const terminal = (s: string) => s === 'delivered' || s === 'cancelled' || s === 'expired';

export function PartnerProvider({ children }: { children: ReactNode }) {
  const { session, setMe, onToastClick } = useStore();
  const me = session!.me; const partner = me.partner!;
  const nav = useNavigate(); const loc = useLocation();
  const [requests, setRequests] = useState<Record<string, PView>>({});
  const [mine, setMine] = useState<Record<string, PView>>({});
  const [runs, setRuns] = useState<RView[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatFor, setChatFor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [declinedExtra, setDeclinedExtra] = useState<Record<string, boolean>>({});
  const [gps, setGps] = useState<PState['gps']>('unknown');
  const [sim, setSim] = useState(false);
  const [keepDelivered, setKeepDelivered] = useState<string | null>(null); // show the delivered screen until the partner leaves it
  const locRef = useRef(loc.pathname); locRef.current = loc.pathname;
  const mineRef = useRef(mine); mineRef.current = mine;
  const reqRef = useRef(requests); reqRef.current = requests;

  const refreshEarnings = useCallback(async () => { try { setEarnings(await api<Earnings>('/api/partner/earnings')); } catch { /* offline */ } }, []);
  const refreshRuns = useCallback(async () => { try { setRuns(await api<RView[]>('/api/partner/runs')); } catch { /* offline */ } }, []);
  const postLocation = useCallback(async (pos: { lat: number; lng: number }) => { try { const p = await post('/api/partner/location', pos); setMe({ partner: p }); } catch { /* ignore */ } }, [setMe]);

  // the job on screen: the order the API says I am working on, else my only active job
  const active = useMemo<PView | null>(() => {
    if (partner.activeOrderId && mine[partner.activeOrderId]) return mine[partner.activeOrderId];
    if (keepDelivered && mine[keepDelivered]) return mine[keepDelivered];
    const list = Object.values(mine).filter(o => ACTIVE.has(o.status) || o.status === 'delivered');
    return list.find(o => ACTIVE.has(o.status)) ?? null;
  }, [mine, partner.activeOrderId, keepDelivered]);
  const activeRun = useMemo(() => (partner.activeRunId ? runs.find(r => r.id === partner.activeRunId) ?? null : null), [runs, partner.activeRunId]);
  const activeRef = useRef(active); activeRef.current = active;

  // bootstrap
  useEffect(() => {
    api('/api/bootstrap').then(b => {
      setRequests(Object.fromEntries((b.requests as PView[]).map(r => [r.id, r])));
      const m: Record<string, PView> = {};
      if (b.active) m[b.active.id] = b.active;
      for (const r of (b.runs as RView[]) ?? []) for (const o of r.orders ?? []) if (!terminal(o.status)) m[o.id] = o;
      setMine(m); setRuns(b.runs ?? []); setEarnings(b.earnings ?? null);
    }).catch(() => {});
  }, []);
  // chat follows the active order
  useEffect(() => {
    if (!active || active.id === chatFor) return;
    setChatFor(active.id); setUnread(0);
    api<Message[]>(`/api/orders/${active.id}/messages`).then(setMessages).catch(() => setMessages([]));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const absorb = useCallback((o: PView) => {
    if (o.courierId === partner.id) {
      setMine(m => { if (terminal(o.status) && o.status !== 'delivered') { const { [o.id]: _, ...rest } = m; return rest; } return { ...m, [o.id]: o }; });
      setRequests(r => { if (!(o.id in r)) return r; const { [o.id]: _, ...rest } = r; return rest; });
      if (o.status === 'delivered') { setKeepDelivered(o.id); refreshEarnings(); }
      if (o.runId) refreshRuns();
      return;
    }
    setMine(m => { if (!(o.id in m)) return m; const { [o.id]: _, ...rest } = m; return rest; });
    const prev = reqRef.current[o.id];
    const open = OPEN.has(o.status) && !o.courierId && !o.declinedByMe && o.mode !== 'run' && (o.mode !== 'choose' || o.chosenId === partner.id);
    if (prev?.myCounter && !o.myCounter && o.status === 'requesting' && !o.courierId) setDeclinedExtra(d => ({ ...d, [o.id]: true }));
    if (o.myCounter) setDeclinedExtra(d => { if (!d[o.id]) return d; const { [o.id]: _, ...rest } = d; return rest; });
    setRequests(r => { if (open) return { ...r, [o.id]: o }; if (!(o.id in r)) return r; const { [o.id]: _, ...rest } = r; return rest; });
  }, [partner.id, refreshEarnings, refreshRuns]);

  useEvent(ev => {
    if (ev.type === 'order.created' || ev.type === 'order.updated') absorb(ev.order as unknown as PView);
    else if (ev.type === 'order.gone') setRequests(r => { const { [ev.orderId]: _, ...rest } = r; return rest; });
    else if (ev.type === 'message.sent') { const m = ev.message; if (activeRef.current?.id === m.orderId) { setMessages(ms => ms.some(x => x.id === m.id) ? ms : [...ms, m]); if (m.from === 'customer' && !locRef.current.endsWith('/job/chat')) setUnread(u => u + 1); } }
    else if (ev.type === 'order.completed') refreshEarnings();
    else if (ev.type === 'run.updated') { const r = ev.run as RView; if (r.partnerId === partner.id) { refreshRuns(); } }
  }, [absorb]);

  useEffect(() => { onToastClick.current = (orderId) => { if (!orderId) { nav('/partner/runs'); return; } if (mineRef.current[orderId]) nav('/partner/job'); else if (reqRef.current[orderId]) nav(`/partner/request/${orderId}`); else nav('/partner'); }; return () => { onToastClick.current = null; }; }, [nav, onToastClick]);

  // real GPS when online
  useEffect(() => {
    if (!partner.online) return;
    return watchPosition(p => postLocation(p), s => setGps(s === 'ok' ? 'ok' : s === 'denied' ? 'denied' : 'unavailable'));
  }, [partner.online, postLocation]);
  // no GPS: make sure the partner has a position so requests reach them, and default to simulated movement
  useEffect(() => { if (gps === 'unavailable' || gps === 'denied') { setSim(true); if (partner.online && !partner.pos) postLocation(FALLBACK_POS); } }, [gps, partner.online, partner.pos, postLocation]);
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

  /** Order event; queued offline (and replayed later) instead of failing. */
  const event = useCallback(async (orderId: string, body: Record<string, unknown>): Promise<EventResult> => {
    const r = await postOrQueue<PView>(`/api/orders/${orderId}/events`, body, `${body.type} · ${orderId}`);
    if (!r.queued) absorb(r.result);
    return r;
  }, [absorb]);
  const clearActive = useCallback(() => { setKeepDelivered(null); setMine(m => Object.fromEntries(Object.entries(m).filter(([, o]) => o.status !== 'delivered'))); setMessages([]); setUnread(0); }, []);
  const markRead = useCallback(() => setUnread(0), []);
  const value = useMemo<PState>(() => ({ requests, mine, active, activeRun, runs, earnings, messages, unread, declinedExtra, sim, gps, setSim, refreshEarnings, refreshRuns, clearActive, setMessages, markRead, event, postLocation, myPos: partner.pos ?? FALLBACK_POS }), [requests, mine, active, activeRun, runs, earnings, messages, unread, declinedExtra, sim, gps, refreshEarnings, refreshRuns, clearActive, markRead, event, postLocation, partner.pos]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function usePartner() { const s = useContext(Ctx); if (!s) throw new Error('PartnerProvider missing'); return s; }

export const PHASE: Record<string, string> = { scheduled: 'Waiting for the trip', to_shop: 'Heading to the shop', shopping: 'At the shop', to_customer: 'Delivering', arrived: 'Handover', delivered: 'Delivered' };
export const PHASE_PARCEL: Record<string, string> = { scheduled: 'Waiting for the trip', to_shop: 'Heading to the pickup', shopping: 'At the pickup', to_customer: 'Delivering to the receiver', arrived: 'Handover', delivered: 'Delivered' };
export const phaseLabel = (o: PView) => (o.kind === 'parcel' ? PHASE_PARCEL : PHASE)[o.status] ?? o.status;
export const itemsLabel = (o: PView) => o.kind === 'parcel' ? `${o.pkType ?? 'Package'} · ${o.pkSize ?? ''}`.trim() : o.kind === 'shop' ? `${o.items.length} item${o.items.length > 1 ? 's' : ''} packed by the shop · ₹${o.itemsTotal ?? 0}` : `${o.items.length} item${o.items.length > 1 ? 's' : ''} to buy · ${o.items.map(i => i.name).slice(0, 3).join(', ')}${o.items.length > 3 ? '…' : ''}`;
export const fmtKm = (km: number | null | undefined) => km == null ? '' : km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km';
export const navigateTo = (p: { lat: number; lng: number }) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`, '_blank', 'noopener');
export const firstName = (o: PView) => (o.anon ? 'Customer' : o.customerName.split(' ')[0]);
export const whenStr = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
export const timeStr = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
