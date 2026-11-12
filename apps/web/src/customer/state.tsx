// Customer-side state: orders map kept live from realtime events, the current
// deliver-to address, trips (runs) and the community board, drafts for
// list / package / cart.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Address, Announcement, Message, Subscription } from '@getme/core';
import { ACTIVE, OPEN, WAITING } from '@getme/core';
import { api, ApiError } from '../lib/api';
import { postOrQueue } from '../lib/offline';
import { useEvent, useStore } from '../lib/store';
import { useT } from '../lib/i18n';

export interface ListItem { id: string; name: string; qty: number }
export interface ListDraft { items: ListItem[]; note: string; subs: boolean; source: string; when: 'now' | 'schedule'; slot: string; repeat: boolean; budget: string; photoUrl: string | null }
export interface PackageDraft { drop: Address | null; name: string; phone: string; type: string; size: string; photoUrl: string | null; insure: boolean; note: string }
export interface Cart { shopId: string | null; qty: Record<string, number> }
export type CheckoutKind = 'list' | 'shop' | 'parcel';

export const emptyList = (): ListDraft => ({ items: [], note: '', subs: true, source: 'any', when: 'now', slot: 'Today 6–7 pm', repeat: false, budget: '', photoUrl: null });
export const emptyPackage = (): PackageDraft => ({ drop: null, name: '', phone: '', type: 'Documents', size: 'Small', photoUrl: null, insure: false, note: '' });

interface CustomerState {
  orders: Record<string, any>;
  orderList: any[];
  activeOrders: any[];
  subs: Subscription[];
  unread: Record<string, number>;
  clearUnread: (orderId: string) => void;
  refresh: () => Promise<void>;
  setSubs: (s: Subscription[]) => void;
  list: ListDraft; setList: (f: (d: ListDraft) => ListDraft) => void;
  pkg: PackageDraft; setPkg: (f: (d: PackageDraft) => PackageDraft) => void;
  cart: Cart; setCart: (f: (c: Cart) => Cart) => void;
  coKind: CheckoutKind; setCoKind: (k: CheckoutKind) => void;
  lastMessage: Message | null;
  chatOpen: React.MutableRefObject<string | null>;
  patchOrder: (o: any) => void;
  /** Where the next order goes. A saved address (has id) or an in-memory GPS / pinned one. */
  address: Address | null; setAddress: (a: Address | null) => void;
  runs: any[]; refreshRuns: () => Promise<void>;
  board: any | null; refreshBoard: () => Promise<void>;
  /** Trip preselected for the next checkout (from Trips / notice board). */
  pendingRun: string | null; setPendingRun: (id: string | null) => void;
}
const Ctx = createContext<CustomerState | null>(null);
const ADDR_KEY = 'getme.customer.address';

export function CustomerProvider({ children }: { children: ReactNode }) {
  const { session, onToastClick } = useStore();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [list, setListState] = useState<ListDraft>(emptyList);
  const [pkg, setPkgState] = useState<PackageDraft>(emptyPackage);
  const [cart, setCartState] = useState<Cart>({ shopId: null, qty: {} });
  const [coKind, setCoKind] = useState<CheckoutKind>('list');
  const [lastMessage, setLastMessage] = useState<Message | null>(null);
  const [address, setAddressState] = useState<Address | null>(() => { try { const raw = sessionStorage.getItem(ADDR_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } });
  const [runs, setRuns] = useState<any[]>([]);
  const [board, setBoard] = useState<any | null>(null);
  const [pendingRun, setPendingRun] = useState<string | null>(null);
  const chatOpen = useRef<string | null>(null);

  const setAddress = useCallback((a: Address | null) => { setAddressState(a); try { if (a) sessionStorage.setItem(ADDR_KEY, JSON.stringify(a)); else sessionStorage.removeItem(ADDR_KEY); } catch { /* ignore */ } }, []);
  const patchOrder = useCallback((o: any) => setOrders(m => ({ ...m, [o.id]: { ...(m[o.id] ?? {}), ...o } })), []);
  const refreshRuns = useCallback(async () => { const at = address; setRuns(await api('/api/runs' + (at ? `?lat=${at.lat}&lng=${at.lng}` : ''))); }, [address]);
  const refreshBoard = useCallback(async () => setBoard(await api('/api/community/board')), []);
  const refresh = useCallback(async () => {
    const b = await api('/api/bootstrap');
    setOrders(Object.fromEntries((b.orders as any[]).map(o => [o.id, o])));
    setSubs(b.subscriptions ?? []);
    setRuns(b.runs ?? []);
    setBoard(b.board ?? null);
  }, []);
  useEffect(() => { refresh().catch(() => {}); }, [refresh, session?.token]);
  // default deliver-to = first saved address, unless a GPS/pinned one was chosen this session
  const saved = session?.me.addresses;
  useEffect(() => { if (!address && saved?.length) setAddress(saved[0]); }, [saved, address, setAddress]);

  useEvent(ev => {
    if (ev.type === 'order.created' || ev.type === 'order.updated') patchOrder(ev.order);
    else if (ev.type === 'location.updated') setOrders(m => m[ev.orderId!] ? { ...m, [ev.orderId!]: { ...m[ev.orderId!], courierPos: ev.pos } } : m);
    else if (ev.type === 'message.sent') { setLastMessage(ev.message); if (ev.message.from !== 'customer' && chatOpen.current !== ev.message.orderId) setUnread(u => ({ ...u, [ev.message.orderId]: (u[ev.message.orderId] ?? 0) + 1 })); }
    else if (ev.type === 'run.updated') { setRuns(rs => { const i = rs.findIndex(r => r.id === ev.run.id); const next = i >= 0 ? rs.map(r => r.id === ev.run.id ? { ...r, ...ev.run } : r) : rs; return next; }); refreshRuns().catch(() => {}); setBoard((b: any) => b ? { ...b, runs: b.runs.map((r: any) => r.id === ev.run.id ? { ...r, ...ev.run } : r) } : b); }
    else if (ev.type === 'announcement') setBoard((b: any) => b && b.community?.id === ev.announcement.communityId ? { ...b, announcements: [ev.announcement, ...b.announcements.filter((a: Announcement) => a.id !== ev.announcement.id)] } : b);
    else if (ev.type === 'notify' && /trip|going to/i.test(ev.title + ' ' + ev.body)) refreshRuns().catch(() => {});
  });

  useEffect(() => { onToastClick.current = (orderId) => { if (orderId) nav(`/customer/order/${orderId}`); else nav('/customer/runs'); }; return () => { onToastClick.current = null; }; }, [nav, onToastClick]);

  const orderList = useMemo(() => Object.values(orders).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [orders]);
  const activeOrders = useMemo(() => orderList.filter(o => OPEN.has(o.status) || ACTIVE.has(o.status) || WAITING.has(o.status)), [orderList]);
  const clearUnread = useCallback((id: string) => setUnread(u => (u[id] ? { ...u, [id]: 0 } : u)), []);
  const setList = useCallback((f: (d: ListDraft) => ListDraft) => setListState(f), []);
  const setPkg = useCallback((f: (d: PackageDraft) => PackageDraft) => setPkgState(f), []);
  const setCart = useCallback((f: (c: Cart) => Cart) => setCartState(f), []);

  const value = useMemo<CustomerState>(() => ({ orders, orderList, activeOrders, subs, unread, clearUnread, refresh, setSubs, list, setList, pkg, setPkg, cart, setCart, coKind, setCoKind, lastMessage, chatOpen, patchOrder, address, setAddress, runs, refreshRuns, board, refreshBoard, pendingRun, setPendingRun }),
    [orders, orderList, activeOrders, subs, unread, clearUnread, refresh, list, setList, pkg, setPkg, cart, setCart, coKind, lastMessage, patchOrder, address, setAddress, runs, refreshRuns, board, refreshBoard, pendingRun]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useCustomer() { const c = useContext(Ctx); if (!c) throw new Error('CustomerProvider missing'); return c; }

/** Post a machine event for an order. Queues it when offline (server replays are idempotent). */
export function useOrderEvent() {
  const { patchOrder } = useCustomer(); const { toast } = useStore(); const { t } = useT();
  return useCallback(async (orderId: string, body: Record<string, unknown>) => {
    const r = await postOrQueue(`/api/orders/${orderId}/events`, body, String(body.type));
    if (r.queued) { toast(t('Saved · will send when online')); return null; }
    patchOrder(r.result); return r.result;
  }, [patchOrder, toast, t]);
}
export { ApiError };
export const orderSummary = (o: any) => o.kind === 'parcel' ? 'Package to ' + (o.receiver?.name ?? 'receiver') : o.kind === 'list' ? 'Shopping list · ' + o.shopName : o.shopName;
export const itemsLabel = (o: any) => o.kind === 'parcel' ? `${o.pkType} · ${o.pkSize} package · to ${o.receiver?.name ?? ''}${o.receiver?.phone ? ' (' + o.receiver.phone + ')' : ''}` : `${o.items.length} item${o.items.length > 1 ? 's' : ''} · ` + o.items.map((i: any) => i.name + ' × ' + i.qty).join(', ');
export const PAY_LABEL: Record<string, string> = { cod: 'Cash on delivery', upi: 'UPI', card: 'Card', wallet: 'GetMe wallet' };
/** Address fields for a quote / order: saved → by id, otherwise inline. */
export const addressInput = (a: Address | null) => a ? (a.id ? { addressId: a.id } : { address: a }) : {};
export const timeAt = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const dayAt = (iso: string) => { const d = new Date(iso), t = new Date(); const same = d.toDateString() === t.toDateString(); const tm = new Date(t); tm.setDate(t.getDate() + 1); return same ? 'Today' : d.toDateString() === tm.toDateString() ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); };
