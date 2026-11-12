// Customer-side state: orders map kept live from realtime events, drafts for
// list / package / cart, subscriptions and notifications.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Message, Notification, Subscription } from '@getme/core';
import { ACTIVE, OPEN } from '@getme/core';
import { api } from '../lib/api';
import { useEvent, useStore } from '../lib/store';

export interface ListItem { id: string; name: string; qty: number }
export interface ListDraft { items: ListItem[]; note: string; subs: boolean; source: string; when: 'now' | 'schedule'; slot: string; repeat: boolean; budget: string; photoUrl: string | null }
export interface PackageDraft { drop: string; name: string; phone: string; type: string; size: string; photoUrl: string | null; insure: boolean; note: string }
export interface Cart { shopId: string | null; qty: Record<string, number> }
export type CheckoutKind = 'list' | 'shop' | 'parcel';

export const emptyList = (): ListDraft => ({ items: [], note: '', subs: true, source: 'any', when: 'now', slot: 'Today 6–7 pm', repeat: false, budget: '', photoUrl: null });
export const emptyPackage = (): PackageDraft => ({ drop: '', name: '', phone: '', type: 'Documents', size: 'Small', photoUrl: null, insure: false, note: '' });

interface CustomerState {
  orders: Record<string, any>;
  orderList: any[];
  activeOrders: any[];
  subs: Subscription[];
  notifications: Notification[];
  unread: Record<string, number>;
  clearUnread: (orderId: string) => void;
  refresh: () => Promise<void>;
  reloadNotifications: () => Promise<void>;
  setSubs: (s: Subscription[]) => void;
  list: ListDraft; setList: (f: (d: ListDraft) => ListDraft) => void;
  pkg: PackageDraft; setPkg: (f: (d: PackageDraft) => PackageDraft) => void;
  cart: Cart; setCart: (f: (c: Cart) => Cart) => void;
  coKind: CheckoutKind; setCoKind: (k: CheckoutKind) => void;
  lastMessage: Message | null;
  chatOpen: React.MutableRefObject<string | null>;
  patchOrder: (o: any) => void;
}
const Ctx = createContext<CustomerState | null>(null);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const { session, onToastClick } = useStore();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [list, setListState] = useState<ListDraft>(emptyList);
  const [pkg, setPkgState] = useState<PackageDraft>(emptyPackage);
  const [cart, setCartState] = useState<Cart>({ shopId: null, qty: {} });
  const [coKind, setCoKind] = useState<CheckoutKind>('list');
  const [lastMessage, setLastMessage] = useState<Message | null>(null);
  const chatOpen = useRef<string | null>(null);

  const patchOrder = useCallback((o: any) => setOrders(m => ({ ...m, [o.id]: { ...(m[o.id] ?? {}), ...o } })), []);
  const refresh = useCallback(async () => {
    const b = await api('/api/bootstrap');
    setOrders(Object.fromEntries((b.orders as any[]).map(o => [o.id, o])));
    setSubs(b.subscriptions ?? []);
    setNotifications(b.notifications ?? []);
  }, []);
  const reloadNotifications = useCallback(async () => setNotifications(await api('/api/notifications')), []);
  useEffect(() => { refresh().catch(() => {}); }, [refresh, session?.token]);

  useEvent(ev => {
    if (ev.type === 'order.created' || ev.type === 'order.updated') patchOrder(ev.order);
    else if (ev.type === 'location.updated') setOrders(m => m[ev.orderId!] ? { ...m, [ev.orderId!]: { ...m[ev.orderId!], courierPos: ev.pos } } : m);
    else if (ev.type === 'message.sent') { setLastMessage(ev.message); if (ev.message.from !== 'customer' && chatOpen.current !== ev.message.orderId) setUnread(u => ({ ...u, [ev.message.orderId]: (u[ev.message.orderId] ?? 0) + 1 })); }
    else if (ev.type === 'notify') setNotifications(n => [{ id: 'tmp' + Date.now(), userId: '', title: ev.title, body: ev.body, orderId: ev.orderId, read: false, at: new Date().toISOString() }, ...n].slice(0, 50));
  });

  useEffect(() => { onToastClick.current = (orderId) => { if (orderId) nav(`/customer/order/${orderId}`); }; return () => { onToastClick.current = null; }; }, [nav, onToastClick]);

  const orderList = useMemo(() => Object.values(orders).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [orders]);
  const activeOrders = useMemo(() => orderList.filter(o => OPEN.has(o.status) || ACTIVE.has(o.status)), [orderList]);
  const clearUnread = useCallback((id: string) => setUnread(u => (u[id] ? { ...u, [id]: 0 } : u)), []);
  const setList = useCallback((f: (d: ListDraft) => ListDraft) => setListState(f), []);
  const setPkg = useCallback((f: (d: PackageDraft) => PackageDraft) => setPkgState(f), []);
  const setCart = useCallback((f: (c: Cart) => Cart) => setCartState(f), []);

  const value = useMemo<CustomerState>(() => ({ orders, orderList, activeOrders, subs, notifications, unread, clearUnread, refresh, reloadNotifications, setSubs, list, setList, pkg, setPkg, cart, setCart, coKind, setCoKind, lastMessage, chatOpen, patchOrder }),
    [orders, orderList, activeOrders, subs, notifications, unread, clearUnread, refresh, reloadNotifications, list, setList, pkg, setPkg, cart, setCart, coKind, lastMessage, patchOrder]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useCustomer() { const c = useContext(Ctx); if (!c) throw new Error('CustomerProvider missing'); return c; }

/** Post a machine event for an order and merge the returned view. */
export function useOrderEvent() {
  const { patchOrder } = useCustomer();
  return useCallback(async (orderId: string, body: Record<string, unknown>) => { const o = await api(`/api/orders/${orderId}/events`, { method: 'POST', body }); patchOrder(o); return o; }, [patchOrder]);
}
export const orderSummary = (o: any) => o.kind === 'parcel' ? 'Package to ' + (o.receiver?.name ?? 'receiver') : o.kind === 'list' ? 'Shopping list · ' + o.shopName : o.shopName;
export const itemsLabel = (o: any) => o.kind === 'parcel' ? `${o.pkType} · ${o.pkSize} package · to ${o.receiver?.name ?? ''}${o.receiver?.phone ? ' (' + o.receiver.phone + ')' : ''}` : `${o.items.length} item${o.items.length > 1 ? 's' : ''} · ` + o.items.map((i: any) => i.name + ' × ' + i.qty).join(', ');
export const PAY_LABEL: Record<string, string> = { cod: 'Cash on delivery', upi: 'UPI', card: 'Card', wallet: 'GetMe wallet' };
