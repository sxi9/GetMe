// Application service: the only place that mutates orders. Every change goes
// through the core reducer, is persisted, and fans out as realtime events
// with role-specific redaction.
import {
  ACTIVE, DISPATCH, DomainError, apply, bill, choosablePartners, deliveryFeeForKm, dispatchTick, eligiblePartners, etaMinutes, haversineKm,
  isDue, itemsTotal, listDeliveryFee, makeFee, parcelDeliveryFee, promoFor, settle, validateParcel, type Address, type LatLng, type Message, type Notification,
  type Order, type OrderEventInput, type OrderItem, type OrderKind, type Partner, type Role, type Shop, type Subscription, type User,
} from '@getme/core';
import type { Db } from './db.js';
import type { Bus } from './bus.js';
import { now, otp4, token, uid } from './ids.js';

export interface Ctx { user: User; partner: Partner | null; shop: Shop | null }

export interface CreateOrderInput {
  kind: OrderKind;
  items?: { name: string; qty: number; itemId?: string }[];
  shopId?: string | null;           // list: preferred shop or null for any; shop: the catalogue shop
  addressId?: string;               // drop address (customer's saved address)
  address?: Partial<Address>;       // or an inline drop address (parcels)
  pickupAddressId?: string;         // parcels
  mode: 'broadcast' | 'offers' | 'choose';
  pay: 'cod' | 'upi' | 'card' | 'wallet';
  promoCode?: string | null;
  when?: 'now' | 'schedule'; slot?: string | null; scheduledAt?: string | null;
  budget?: number | null; subs?: boolean; repeat?: boolean; anon?: boolean; note?: string;
  receiver?: { name: string; phone: string } | null; pkType?: string | null; pkSize?: string | null; insure?: boolean;
}

export class Service {
  constructor(public db: Db, public bus: Bus) {}

  // ---------- helpers
  ctx(user: User): Ctx { return { user, partner: user.role === 'partner' ? this.db.getPartnerByUser(user.id) : null, shop: user.role === 'shop' ? this.db.getShopByOwner(user.id) : null }; }

  notify(userId: string, title: string, body: string, orderId: string | null = null) {
    const n: Notification = { id: uid('n_'), userId, title, body, orderId, read: false, at: now() };
    this.db.putNotification(n);
    this.bus.send(userId, { type: 'notify', title, body, orderId });
  }

  partnerUser(partnerId: string | null) { return partnerId ? this.db.getPartner(partnerId)?.userId ?? null : null; }
  shopOwner(shopId: string | null) { return shopId ? this.db.getShop(shopId)?.ownerId ?? null : null; }

  /** Role-specific projection of an order. */
  view(o: Order, role: Role | 'public', viewer?: Ctx): any {
    const shopStatus = o.kind === 'shop' ? this.db.getShopStatus(o.id) : null;
    const courier = o.courierId ? this.db.getPartner(o.courierId) : null;
    const target: LatLng | null = o.status === 'to_shop' ? (o.shopPos ?? null) : o.status === 'to_customer' ? o.address : null;
    const courierPos = courier?.pos ?? null;
    const etaMin = target && courierPos ? etaMinutes(haversineKm(courierPos, target)) : null;
    const base = { ...o, bill: bill(o), shopStatus, courierPos, etaMin, courier: courier ? { id: courier.id, name: courier.name, initials: courier.initials, vehicle: courier.vehicle, plate: courier.plate, rating: courier.rating, trips: courier.trips } : null };
    if (role === 'customer') return base;
    const { otp, ...noOtp } = base;
    const customerName = o.anon ? 'Customer' : o.customerName;
    if (role === 'partner') {
      const me = viewer?.partner ?? null;
      const origin = o.shopPos ?? o.pickup ?? o.address;
      const km = me?.pos ? haversineKm(me.pos, origin) : null;
      const legKm = haversineKm(origin, o.address);
      return { ...noOtp, customerName, distKm: km, etaMin: km != null ? etaMinutes(km) : null, legKm, myOffer: o.offers.find(x => x.partnerId === me?.id) ?? null, myCounter: o.counter?.partnerId === me?.id ? o.counter : null, declinedByMe: !!me && o.declinedIds.includes(me.id), earn: o.fee.delivery + o.fee.extra + o.tip };
    }
    if (role === 'shop') {
      return { id: o.id, kind: o.kind, customerName, items: o.items, itemsTotal: o.itemsTotal, status: o.status, shopStatus, courierName: o.courierName, createdAt: o.createdAt, times: o.times, note: o.note, subs: o.subs };
    }
    // public tracking link
    return { id: o.id, kind: o.kind, status: o.status, shopName: o.shopName, shopPos: o.shopPos, address: { line: o.address.line, lat: o.address.lat, lng: o.address.lng }, courier: base.courier, courierPos, etaMin, times: o.times, receiver: o.receiver ? { name: o.receiver.name } : null };
  }

  /** Push the latest state of an order to everyone who should see it. */
  broadcastOrder(o: Order, opts: { goneFor?: string[] } = {}) {
    this.bus.send(o.customerId, { type: 'order.updated', order: this.view(o, 'customer') });
    const courierUser = this.partnerUser(o.courierId);
    if (courierUser) this.bus.send(courierUser, { type: 'order.updated', order: this.view(o, 'partner', this.ctx(this.db.getUser(courierUser)!)) });
    const owner = o.kind === 'shop' ? this.shopOwner(o.shopId) : null;
    if (owner) this.bus.send(owner, { type: 'order.updated', order: this.view(o, 'shop') });
    // open requests: every eligible partner sees the latest; everyone else who saw it gets "gone"
    const partners = this.db.listPartners();
    const eligible = new Set(eligiblePartners(o, partners).map(p => p.id));
    for (const p of partners) {
      if (p.id === o.courierId) continue;
      if (eligible.has(p.id)) this.bus.send(p.userId, { type: 'order.updated', order: this.view(o, 'partner', this.ctx(this.db.getUser(p.userId)!)) });
      else if (o.seenIds.includes(p.id) || opts.goneFor?.includes(p.id) || o.offers.some(x => x.partnerId === p.id)) this.bus.send(p.userId, { type: 'order.gone', orderId: o.id, reason: o.status });
    }
  }

  // ---------- shops
  shopsNear(from: LatLng) {
    return this.db.listShops().map(s => this.shopCard(s, from)).sort((a, b) => a.distKm - b.distKm);
  }
  shopCard(s: Shop, from: LatLng) {
    const distKm = haversineKm(s.pos, from);
    const eta = etaMinutes(distKm);
    return { ...s, distKm, etaLabel: `${eta}–${eta + 5} min`, fee: deliveryFeeForKm(distKm), itemCount: s.items.filter(i => i.on).length };
  }

  // ---------- quotes & creation
  quote(ctx: Ctx, input: CreateOrderInput) {
    const addr = this.resolveAddress(ctx, input);
    const shop = input.shopId ? this.db.getShop(input.shopId) : null;
    if (input.shopId && !shop) throw new DomainError('no_shop', 'Shop not found');
    let items: OrderItem[] = [];
    let delivery = 0;
    let insure = 0;
    if (input.kind === 'parcel') {
      delivery = parcelDeliveryFee(input.pkSize ?? 'Small');
      insure = input.insure ? 1 : 0;
      items = [{ name: `${input.pkType ?? 'Package'} · ${input.pkSize ?? 'Small'} package`, qty: 1, unit: '', price: 0 }];
    } else if (input.kind === 'shop') {
      if (!shop) throw new DomainError('no_shop', 'Pick a shop');
      if (!shop.open) throw new DomainError('shop_closed', `${shop.name} is closed right now`);
      for (const it of input.items ?? []) {
        const ci = shop.items.find(x => x.id === it.itemId);
        if (!ci || !ci.on) throw new DomainError('oos', `${ci?.name ?? it.name} is out of stock`);
        if (it.qty > ci.stock) throw new DomainError('oos', `Only ${ci.stock} × ${ci.name} left`);
        items.push({ name: ci.name, qty: it.qty, unit: ci.unit, price: ci.price, itemId: ci.id });
      }
      delivery = deliveryFeeForKm(haversineKm(shop.pos, addr));
    } else {
      items = (input.items ?? []).map(i => ({ name: i.name.trim(), qty: Math.max(1, Math.round(i.qty || 1)), unit: '', price: null })).filter(i => i.name);
      delivery = listDeliveryFee(shop ? haversineKm(shop.pos, addr) : null);
    }
    if (!items.length) throw new DomainError('empty', 'Add at least one item');
    const total = itemsTotal(items);
    const promo = promoFor(input.promoCode, input.kind, delivery);
    const fee = makeFee(delivery, insure);
    const draft = { fee, promo: promo.discount, itemCost: null, itemsTotal: input.kind === 'parcel' ? 0 : total, kind: input.kind };
    return { items, itemsTotal: total, fee, promo: promo.discount, promoMsg: promo.reason || (promo.discount ? `₹${promo.discount} off delivery applied` : ''), bill: bill(draft), shop: shop ? { id: shop.id, name: shop.name, distKm: haversineKm(shop.pos, addr) } : null, address: addr };
  }

  private resolveAddress(ctx: Ctx, input: CreateOrderInput): Address {
    if (input.addressId) {
      const a = this.db.addresses(ctx.user.id).find(x => x.id === input.addressId);
      if (!a) throw new DomainError('no_address', 'Address not found');
      return a;
    }
    if (input.address?.line) {
      // inline address (parcel drop). Geocoding is a stub: unknown drops sit a little north-west of the pickup.
      const home = this.db.addresses(ctx.user.id)[0];
      return { id: undefined, label: input.address.label ?? 'Drop', line: input.address.line, area: input.address.area, lat: input.address.lat ?? (home?.lat ?? 12.9121) + 0.02, lng: input.address.lng ?? (home?.lng ?? 77.6446) - 0.02 };
    }
    const first = this.db.addresses(ctx.user.id)[0];
    if (!first) throw new DomainError('no_address', 'Add a delivery address first');
    return first;
  }

  createOrder(ctx: Ctx, input: CreateOrderInput): Order {
    if (ctx.user.role !== 'customer') throw new DomainError('forbidden', 'Only customers place orders');
    if (input.kind === 'parcel') {
      const err = validateParcel({ drop: input.address?.line, receiverName: input.receiver?.name, receiverPhone: input.receiver?.phone });
      if (err) throw new DomainError('invalid', err);
    }
    const q = this.quote(ctx, input);
    if (input.pay === 'wallet' && this.db.balance(ctx.user.id) < q.bill.fees) throw new DomainError('wallet_low', 'Wallet balance does not cover the delivery fees. Add money or pick another method');
    const pickup = input.kind === 'parcel' ? (input.pickupAddressId ? this.db.addresses(ctx.user.id).find(x => x.id === input.pickupAddressId) : this.db.addresses(ctx.user.id)[0]) ?? null : null;
    const t = now();
    const id = 'GM-' + this.db.nextOrderNo();
    const shop = q.shop ? this.db.getShop(q.shop.id)! : null;
    const o: Order = {
      id, kind: input.kind, customerId: ctx.user.id, customerName: ctx.user.name, anon: !!input.anon,
      shopId: shop?.id ?? null, shopName: input.kind === 'parcel' ? `Pickup · ${pickup?.label ?? 'Home'}` : shop?.name ?? 'Any nearby shop',
      shopPos: input.kind === 'parcel' ? (pickup ? { lat: pickup.lat, lng: pickup.lng } : null) : shop?.pos ?? null,
      items: q.items, itemsTotal: input.kind === 'parcel' ? 0 : q.itemsTotal, address: q.address, pickup,
      mode: input.mode, pay: input.pay, promoCode: q.promo ? (input.promoCode ?? '').toUpperCase() : null, promo: q.promo,
      when: input.when ?? 'now', slot: input.slot ?? null, scheduledAt: input.when === 'schedule' ? (input.scheduledAt ?? slotToIso(input.slot)) : null,
      budget: input.budget ?? null, subs: input.subs ?? true, repeat: !!input.repeat, note: input.note ?? '', receiver: input.receiver ?? null,
      pkType: input.pkType ?? null, pkSize: input.pkSize ?? null,
      status: 'requesting', courierId: null, courierName: null, chosenId: null, offers: [], counter: null, declinedIds: [], seenIds: [],
      fee: q.fee, itemCost: null, receiptUrl: null, pickupPhotoUrl: null, otp: otp4(), cashCollected: false, tip: 0, rating: null, customerRating: null,
      issue: null, refund: null, cancelReason: null, cancelledBy: null, times: { requesting: t }, searchRadiusKm: DISPATCH.radiusKm[0], createdAt: t, updatedAt: t,
    };
    this.db.putOrder(o);
    if (o.kind === 'shop' && shop) {
      this.db.putShopStatus(o.id, shop.id, 'new');
      this.notify(shop.ownerId, 'New order', `${o.id} from ${o.anon ? 'a customer' : o.customerName.split(' ')[0]} · ${o.items.length} item${o.items.length > 1 ? 's' : ''}`, o.id);
      // reserve stock
      shop.items = shop.items.map(ci => { const line = o.items.find(i => i.itemId === ci.id); return line ? { ...ci, stock: ci.stock - line.qty, on: ci.stock - line.qty > 0 } : ci; });
      this.db.putShop(shop);
      this.bus.send(shop.ownerId, { type: 'shop.updated', shop });
      this.bus.send(shop.ownerId, { type: 'order.created', order: this.view(o, 'shop') });
    }
    if (o.repeat && o.kind !== 'parcel') this.createSubscription(ctx, o);
    this.bus.send(o.customerId, { type: 'order.created', order: this.view(o, 'customer') });
    if (isDue(o)) this.announce(o);
    return o;
  }

  /** Tell eligible partners about an open request. */
  announce(o: Order) {
    const partners = this.db.listPartners();
    for (const p of eligiblePartners(o, partners)) {
      const label = o.kind === 'parcel' ? 'Package pickup' : `${o.items.length} item${o.items.length > 1 ? 's' : ''}`;
      this.notify(p.userId, o.mode === 'choose' ? 'Direct request' : 'New request nearby', `${label} · ₹${o.fee.delivery}${o.mode === 'offers' ? ' · send an offer' : ''}`, o.id);
      this.bus.send(p.userId, { type: 'order.created', order: this.view(o, 'partner', this.ctx(this.db.getUser(p.userId)!)) });
    }
  }

  // ---------- events
  /** Apply a machine event on behalf of a user, with side effects. */
  event(ctx: Ctx, orderId: string, ev: OrderEventInput): Order {
    const o = this.db.getOrder(orderId);
    if (!o) throw new DomainError('not_found', 'Order not found');
    const role = ctx.user.role;
    // authorisation: actors must match the caller's role, and partners must identify as themselves
    if (ev.actor !== role && !(ev.actor === 'system' && role === 'partner' && ev.type === 'unassign')) throw new DomainError('forbidden', 'Not allowed');
    if (role === 'customer' && o.customerId !== ctx.user.id) throw new DomainError('forbidden', 'Not your order');
    if (role === 'partner') {
      if (!ctx.partner) throw new DomainError('forbidden', 'No partner profile');
      (ev as any).partnerId = ctx.partner.id; (ev as any).partnerName = ctx.partner.name;
      if ((ev.type === 'accept' || ev.type === 'counter' || ev.type === 'offer') && ctx.partner.activeOrderId) throw new DomainError('busy', 'Finish your current job first');
      if (ev.type === 'accept' && !eligiblePartners(o, [ctx.partner]).length && o.mode !== 'choose') throw new DomainError('not_eligible', 'This request is outside your area or no longer open');
      if (ev.type === 'bought' && o.kind === 'list' && ev.itemCost != null && ev.itemCost > ctx.partner.floatLimit) throw new DomainError('float', `Item cost is above your ₹${ctx.partner.floatLimit} purchase limit. Call support to raise it`);
      if (ev.type === 'bought' && o.kind === 'list' && o.budget != null && ev.itemCost != null && ev.itemCost > o.budget * 1.2) throw new DomainError('over_budget', `That is well over the customer's ₹${o.budget} budget. Message them to confirm first`);
    }
    if (role === 'shop' && ev.type === 'cancel' && o.shopId !== ctx.shop?.id) throw new DomainError('forbidden', 'Not your order');
    const r = apply(o, ev);
    if (!r.ok) throw new DomainError(r.code, r.message);
    return this.commit(o, r.order, ev);
  }

  /** Persist a transition and fan out its side effects. */
  commit(prev: Order, next: Order, ev: OrderEventInput): Order {
    this.db.putOrder(next);
    const wasOpen = prev.status === 'requesting' || prev.status === 'counter';
    const nowActive = ACTIVE.has(next.status);
    const first = (s: string) => s.split(' ')[0];

    // assignment
    if (wasOpen && nowActive && next.courierId) {
      const p = this.db.getPartner(next.courierId)!;
      this.db.putPartner({ ...p, activeOrderId: next.id });
      this.notify(next.customerId, `${p.name} accepted your request`, next.kind === 'parcel' ? 'Heading to the pickup now' : `Heading to ${next.shopId ? next.shopName : 'the nearest shop'} now`, next.id);
      this.pushMessage(next, 'partner', 'text', next.kind === 'parcel' ? 'Accepted. Heading to the pickup now.' : `Accepted. Heading to ${next.shopId ? next.shopName : 'the nearest shop'} now.`);
      if (ev.type !== 'accept') this.notify(p.userId, 'You got the job', `${next.id} · ₹${next.fee.delivery + next.fee.extra}`, next.id);
      const others = this.db.listPartners().filter(x => x.id !== next.courierId && (prev.seenIds.includes(x.id) || prev.offers.some(of => of.partnerId === x.id)));
      for (const x of others) this.notify(x.userId, 'Request taken by another partner', next.id, next.id);
      if (next.kind === 'shop' && next.shopId) this.notify(this.shopOwner(next.shopId)!, 'Partner assigned', `${p.name} will collect ${next.id}`, next.id);
    }
    // status notifications to the customer
    if (prev.status !== next.status) {
      const cn = next.courierName ? first(next.courierName) : 'Your partner';
      const parcel = next.kind === 'parcel';
      const msg: Partial<Record<string, [string, string]>> = {
        shopping: [parcel ? `${cn} reached the pickup point` : `${cn} reached ${next.shopId ? next.shopName : 'the shop'}`, parcel ? 'Collecting your package' : 'Buying your items now'],
        to_customer: [parcel ? 'Package picked up' : `Items bought · ₹${next.itemCost ?? 0}`, parcel ? (next.pickupPhotoUrl ? 'Photo attached' : 'On the way to the receiver') : (next.receiptUrl ? 'Receipt attached · on the way' : 'On the way to you')],
        arrived: [`${cn} has arrived`, parcel ? 'Share the handover code with the receiver' : `Share your handover code ${next.otp}`],
        delivered: ['Delivered', 'Rate your experience'],
        expired: ['No partner found', 'Nobody accepted in time. Try again or widen your options'],
        counter: [`${first(next.counter?.partnerName ?? 'Partner')} asks for ₹${next.counter?.amount} extra`, next.counter?.reason ?? ''],
      };
      const m = msg[next.status];
      if (m) this.notify(next.customerId, m[0], m[1], next.id);
      if (next.status === 'to_customer') this.pushMessage(next, 'partner', 'text', parcel ? 'Picked up the package. On my way to the receiver.' : 'Got everything on the list. On my way.');
      if (next.kind === 'shop' && next.shopId) {
        const map: Partial<Record<string, string>> = { to_customer: 'handed', delivered: 'done', cancelled: 'cancelled', expired: 'cancelled' };
        if (map[next.status]) { this.db.putShopStatus(next.id, next.shopId, map[next.status]!); }
      }
    }
    // offers / counters
    if (ev.type === 'offer') this.notify(next.customerId, `New offer from ${ev.partnerName}`, `₹${ev.price} · ${ev.etaMin} min`, next.id);
    if (ev.type === 'decline_counter' && prev.counter) this.notify(this.partnerUser(prev.counter.partnerId)!, `${first(next.customerName)} declined the extra fee`, 'You can still accept at the base fee', next.id);
    if (ev.type === 'approve_counter' && next.courierId) this.notify(this.partnerUser(next.courierId)!, `${first(next.anon ? 'Customer' : next.customerName)} approved ₹${next.fee.extra} extra`, next.fee.extraReason, next.id);
    if (ev.type === 'decline' && prev.mode === 'choose') this.notify(next.customerId, `${(ev as any).partnerName ?? 'Partner'} declined`, 'Choose another partner', next.id);
    if (ev.type === 'chosen_timeout' && prev.chosenId) this.notify(next.customerId, 'No answer from that partner', 'Choose another partner', next.id);

    // release the partner on terminal / unassign
    if (prev.courierId && (next.status === 'cancelled' || next.status === 'expired' || next.status === 'delivered' || !next.courierId)) {
      const p = this.db.getPartner(prev.courierId);
      if (p && p.activeOrderId === next.id) this.db.putPartner({ ...p, activeOrderId: null, trips: next.status === 'delivered' ? p.trips + 1 : p.trips });
    }
    if (next.status === 'cancelled') {
      const cu = this.partnerUser(prev.courierId);
      if (cu) this.notify(cu, `Request ${next.id} was cancelled`, `by the ${next.cancelledBy}`, next.id);
      if (next.kind === 'shop' && next.shopId) { this.notify(this.shopOwner(next.shopId)!, `Order ${next.id} cancelled`, '', next.id); this.restock(next); }
      if (next.cancelledBy !== 'customer') this.notify(next.customerId, `Order ${next.id} cancelled`, next.cancelReason ?? '', next.id);
    }
    if (next.status === 'expired' && next.kind === 'shop' && next.shopId) this.restock(next);
    if (next.status === 'delivered' && prev.status !== 'delivered') this.settleOrder(next);
    if (ev.type === 'tip' && next.tip !== prev.tip) this.applyTip(prev, next);
    if (ev.type === 'rate' && next.rating && next.courierId) this.applyRating(next);
    if (ev.type === 'report_issue') this.notify(next.customerId, 'Reported: ' + next.issue, 'Refund review within 24 h', next.id);
    if (ev.type === 'unassign' && prev.courierId) { this.notify(next.customerId, `${prev.courierName} could not continue`, 'Finding another partner', next.id); this.announce(next); }
    if (ev.type === 'decline_counter' || ev.type === 'chosen_timeout' || (ev.type === 'decline' && prev.mode !== 'choose')) { /* still open, nothing more */ }

    const goneFor = ev.type === 'decline' ? [(ev as any).partnerId] : [];
    this.broadcastOrder(next, { goneFor });
    if (prev.status !== next.status) this.bus.send(next.customerId, { type: 'status.changed', orderId: next.id, status: next.status });
    return next;
  }

  private restock(o: Order) {
    const shop = this.db.getShop(o.shopId!); if (!shop) return;
    shop.items = shop.items.map(ci => { const line = o.items.find(i => i.itemId === ci.id); return line ? { ...ci, stock: ci.stock + line.qty, on: true } : ci; });
    this.db.putShop(shop); this.bus.send(shop.ownerId, { type: 'shop.updated', shop });
  }

  private settleOrder(o: Order) {
    const s = settle(o), t = now();
    const partner = this.db.getPartner(o.courierId!)!;
    if (s.customerCharge > 0) {
      this.db.putLedger({ id: uid('l_'), userId: o.customerId, orderId: o.id, kind: 'charge', amount: o.pay === 'wallet' ? -s.customerCharge : 0, note: `${o.id} · ${o.pay.toUpperCase()} · ₹${s.customerCharge}`, at: t });
      if (o.pay === 'wallet') this.bus.send(o.customerId, { type: 'wallet.updated', balance: this.db.balance(o.customerId) });
    }
    if (o.kind === 'list' && (o.itemCost ?? 0) > 0 && o.pay !== 'cod') this.db.putLedger({ id: uid('l_'), userId: partner.userId, orderId: o.id, kind: 'reimburse', amount: o.itemCost!, note: `Items you paid for · ${o.id}`, at: t });
    this.db.putLedger({ id: uid('l_'), userId: partner.userId, orderId: o.id, kind: o.pay === 'cod' ? 'cod_due' : 'payout', amount: o.pay === 'cod' ? s.partnerLedgerDelta : s.partnerEarned, note: o.pay === 'cod' ? `Cash collected ₹${s.cashCollected} · platform share` : `Delivery ${o.id}`, at: t });
    if (o.kind === 'shop' && o.shopId) { const owner = this.shopOwner(o.shopId)!; this.db.putLedger({ id: uid('l_'), userId: owner, orderId: o.id, kind: 'payout', amount: s.shopPayout, note: `Settlement ${o.id} (after 8% commission)`, at: t }); }
    // daily bonus
    const tripsToday = this.db.ordersByCourier(o.courierId!).filter(x => x.status === 'delivered' && x.times.delivered && x.times.delivered.slice(0, 10) === t.slice(0, 10)).length;
    if (tripsToday === 12) { this.db.putLedger({ id: uid('l_'), userId: partner.userId, orderId: null, kind: 'bonus', amount: 100, note: 'Daily bonus · 12 trips', at: t }); this.notify(partner.userId, 'Daily bonus unlocked', '₹100 added for 12 trips today'); }
    this.bus.send(partner.userId, { type: 'partner.updated', partner: this.db.getPartner(partner.id)! });
    this.bus.send(o.customerId, { type: 'order.completed', orderId: o.id });
  }

  private applyTip(prev: Order, next: Order) {
    const delta = next.tip - prev.tip; if (!delta) return;
    const partner = this.db.getPartner(next.courierId!)!, t = now();
    this.db.putLedger({ id: uid('l_'), userId: partner.userId, orderId: next.id, kind: 'tip', amount: delta, note: `Tip · ${next.id}`, at: t });
    this.db.putLedger({ id: uid('l_'), userId: next.customerId, orderId: next.id, kind: 'charge', amount: next.pay === 'wallet' ? -delta : 0, note: `Tip ${next.id}`, at: t });
    if (next.pay === 'wallet') this.bus.send(next.customerId, { type: 'wallet.updated', balance: this.db.balance(next.customerId) });
  }
  private applyRating(o: Order) {
    const p = this.db.getPartner(o.courierId!)!;
    const n = Math.max(p.trips, 1);
    const rating = Math.round(((p.rating * (n - 1) + o.rating!.stars) / n) * 100) / 100;
    this.db.putPartner({ ...p, rating });
    this.notify(p.userId, `${o.anon ? 'Customer' : o.customerName.split(' ')[0]} rated you ${o.rating!.stars} stars`, o.tip ? `Tip ₹${o.tip}` : '', o.id);
    this.bus.send(p.userId, { type: 'partner.updated', partner: this.db.getPartner(p.id)! });
  }

  // ---------- chat
  pushMessage(o: Order, from: Role, type: Message['type'], text: string, pos: LatLng | null = null): Message {
    const m: Message = { id: uid('m_'), orderId: o.id, from, type, text, pos, at: now() };
    this.db.putMessage(m);
    const targets = [o.customerId, this.partnerUser(o.courierId)].filter(Boolean) as string[];
    this.bus.sendMany(targets, { type: 'message.sent', message: m });
    const to = from === 'customer' ? this.partnerUser(o.courierId) : o.customerId;
    const who = from === 'customer' ? (o.anon ? 'Customer' : o.customerName.split(' ')[0]) : (o.courierName ?? 'Partner').split(' ')[0];
    if (to && from !== 'partner' || (from === 'partner' && to && type !== 'text')) this.notify(to!, who, type === 'text' ? text : type === 'photo' ? 'sent a photo' : 'shared a live location', o.id);
    else if (to) this.bus.send(to, { type: 'notify', title: who, body: text, orderId: o.id });
    return m;
  }
  canChat(ctx: Ctx, o: Order) {
    return (ctx.user.role === 'customer' && o.customerId === ctx.user.id) || (ctx.user.role === 'partner' && ctx.partner?.id === o.courierId);
  }

  // ---------- partner
  setOnline(ctx: Ctx, online: boolean) {
    const p = ctx.partner!; const next = { ...p, online };
    this.db.putPartner(next); this.bus.send(p.userId, { type: 'partner.updated', partner: next });
    if (online) for (const o of this.db.openOrders()) if (isDue(o) && eligiblePartners(o, [next]).length) this.bus.send(p.userId, { type: 'order.created', order: this.view(o, 'partner', { ...ctx, partner: next }) });
    return next;
  }
  setLocation(ctx: Ctx, pos: LatLng) {
    const p = ctx.partner!; const next = { ...p, pos, posAt: now() };
    this.db.putPartner(next);
    if (p.activeOrderId) {
      const o = this.db.getOrder(p.activeOrderId);
      if (o) { this.bus.send(o.customerId, { type: 'location.updated', orderId: o.id, partnerId: p.id, pos }); const tok = this.db.getMeta('share:' + o.id); if (tok) this.bus.send('track:' + tok, { type: 'location.updated', orderId: o.id, partnerId: p.id, pos }); }
    }
    return next;
  }
  requestsFor(ctx: Ctx) {
    const p = ctx.partner!;
    return this.db.openOrders().filter(o => isDue(o) && eligiblePartners(o, [p]).length).map(o => this.view(o, 'partner', ctx));
  }
  markSeen(ctx: Ctx, orderId: string) {
    const o = this.db.getOrder(orderId); if (!o || !ctx.partner || o.seenIds.includes(ctx.partner.id)) return;
    const r = apply(o, { type: 'seen', actor: 'partner', partnerId: ctx.partner.id });
    if (r.ok) { this.db.putOrder(r.order); this.bus.send(o.customerId, { type: 'order.updated', order: this.view(r.order, 'customer') }); }
  }
  earnings(ctx: Ctx) {
    const p = ctx.partner!, uid_ = p.userId;
    const today = new Date().toISOString().slice(0, 10);
    const ledger = this.db.ledger(uid_, 500);
    const sum = (f: (e: any) => boolean) => ledger.filter(f).reduce((a, e) => a + e.amount, 0);
    const delivered = this.db.ordersByCourier(p.id, 200).filter(o => o.status === 'delivered');
    const dayOf = (iso: string) => iso.slice(0, 10);
    const todayOrders = delivered.filter(o => dayOf(o.times.delivered!) === today);
    const earnedOf = (os: Order[]) => os.reduce((a, o) => a + o.fee.delivery + o.fee.extra + o.tip, 0);
    const week: number[] = [];
    const labels: string[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); week.push(earnedOf(delivered.filter(o => dayOf(o.times.delivered!) === k))); labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' })); }
    const firstToday = todayOrders.length ? Math.min(...todayOrders.map(o => Date.parse(o.times.to_shop ?? o.createdAt))) : null;
    const hours = firstToday ? Math.max(0, (Date.now() - firstToday) / 3.6e6) : 0;
    return {
      today: earnedOf(todayOrders), trips: todayOrders.length, tips: todayOrders.reduce((a, o) => a + o.tip, 0),
      hours: `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`, week, labels,
      bonus: { trips: todayOrders.length, target: 12, amount: 100 },
      balance: this.db.balance(uid_), codDue: -sum(e => e.kind === 'cod_due'),
      recent: delivered.slice(0, 10).map(o => ({ id: o.id, label: `${o.kind === 'list' ? 'Shopping list · ' + o.items.length + ' items' : o.kind === 'parcel' ? 'Package' : o.shopName} → ${o.address.area ?? o.address.line}`, amt: o.fee.delivery + o.fee.extra + o.tip, t: o.times.delivered! })),
      ledger: ledger.slice(0, 30),
    };
  }

  // ---------- customer extras
  choosable(ctx: Ctx, orderId: string) {
    const o = this.db.getOrder(orderId); if (!o || o.customerId !== ctx.user.id) throw new DomainError('not_found', 'Order not found');
    const favs = this.db.favourites(ctx.user.id);
    return choosablePartners(o, this.db.listPartners()).map(x => ({ id: x.partner.id, name: x.partner.name, initials: x.partner.initials, vehicle: x.partner.vehicle, rating: x.partner.rating, trips: x.partner.trips, km: x.km, etaMin: etaMinutes(x.km), declined: x.declined, fav: favs.includes(x.partner.id), pos: x.partner.pos }));
  }
  topup(ctx: Ctx, amount: number) {
    if (!(amount > 0 && amount <= 10000)) throw new DomainError('bad_amount', 'Enter an amount between ₹1 and ₹10,000');
    this.db.putLedger({ id: uid('l_'), userId: ctx.user.id, orderId: null, kind: 'topup', amount, note: 'Added via UPI', at: now() });
    const balance = this.db.balance(ctx.user.id);
    this.bus.send(ctx.user.id, { type: 'wallet.updated', balance });
    return balance;
  }
  shareLink(ctx: Ctx, orderId: string) {
    const o = this.db.getOrder(orderId); if (!o || o.customerId !== ctx.user.id) throw new DomainError('not_found', 'Order not found');
    let tok = this.db.getMeta('share:' + o.id);
    if (!tok) { tok = token().slice(0, 12); this.db.setMeta('share:' + o.id, tok); this.db.setMeta('track:' + tok, o.id); }
    return tok;
  }
  tracked(tok: string) { const id = this.db.getMeta('track:' + tok); const o = id ? this.db.getOrder(id) : null; return o ? this.view(o, 'public') : null; }

  createSubscription(ctx: Ctx, o: Order) {
    const d = new Date();
    const next = new Date(d); next.setDate(d.getDate() + 7);
    const s: Subscription = { id: 'sub_' + o.id, customerId: ctx.user.id, label: o.kind === 'shop' ? `${o.shopName} · ${o.items.length} items` : `Shopping list · ${o.items.length} items`, weekday: d.getDay(), slot: o.when === 'now' ? 'around ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : (o.slot ?? ''),
      template: { kind: o.kind, items: o.items.map(i => ({ ...i, bought: false, unavailable: false, substitute: null })), shopId: o.shopId, shopName: o.shopName, mode: o.mode, pay: o.pay, address: o.address, subs: o.subs, note: o.note, budget: o.budget }, active: true, nextRunAt: next.toISOString(), createdAt: now() };
    this.db.putSub(s); return s;
  }
  stopSubscription(ctx: Ctx, id: string) { const s = this.db.getSub(id); if (!s || s.customerId !== ctx.user.id) throw new DomainError('not_found', 'Subscription not found'); this.db.putSub({ ...s, active: false }); }

  // ---------- shop
  advanceShopOrder(ctx: Ctx, orderId: string) {
    const o = this.db.getOrder(orderId); const shop = ctx.shop!;
    if (!o || o.shopId !== shop.id) throw new DomainError('not_found', 'Order not found');
    const cur = this.db.getShopStatus(o.id) ?? 'new';
    const next = ({ new: 'preparing', preparing: 'ready', ready: 'handed' } as Record<string, string>)[cur];
    if (!next) throw new DomainError('bad_state', 'Nothing more to do on this order');
    if (next === 'handed' && !o.courierId) throw new DomainError('no_partner', 'No partner has arrived yet');
    this.db.putShopStatus(o.id, shop.id, next);
    const label: Record<string, string> = { preparing: `${shop.name} is preparing your order`, ready: 'Your order is packed and ready for pickup', handed: 'Order handed to your partner' };
    this.notify(o.customerId, label[next], o.id, o.id);
    if (o.courierId) { const cu = this.partnerUser(o.courierId)!; this.notify(cu, next === 'ready' ? 'Order ready for pickup' : next === 'handed' ? 'Shop marked the order handed over' : 'Shop is preparing the order', o.id, o.id); }
    this.broadcastOrder(this.db.getOrder(o.id)!);
    return next;
  }
  shopAnalytics(ctx: Ctx) {
    const shop = ctx.shop!;
    const orders = this.db.ordersByShop(shop.id, 500);
    const done = orders.filter(o => o.status === 'delivered');
    const today = new Date().toISOString().slice(0, 10);
    const todayDone = done.filter(o => (o.times.delivered ?? '').slice(0, 10) === today);
    const week: number[] = [], labels: string[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); week.push(done.filter(o => (o.times.delivered ?? '').slice(0, 10) === k).reduce((a, o) => a + (o.itemsTotal ?? 0), 0)); labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' })); }
    const counts = new Map<string, number>();
    for (const o of done) for (const i of o.items) counts.set(i.name, (counts.get(i.name) ?? 0) + i.qty);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n }));
    const prep = done.map(o => { const a = Date.parse(o.times.to_shop ?? o.createdAt), b = Date.parse(o.times.to_customer ?? o.createdAt); return Math.max(0, (b - a) / 60000); });
    const avgPrep = prep.length ? Math.round(prep.reduce((a, b) => a + b, 0) / prep.length) : 0;
    const listsBought = this.db.ordersByStatus(['delivered']).filter(o => o.kind === 'list').length;
    const totalDone = listsBought + done.length;
    return { orders: todayDone.length, revenue: todayDone.reduce((a, o) => a + (o.itemsTotal ?? 0), 0), avgPrep, week, labels, top, split: totalDone ? Math.round((listsBought / totalDone) * 100) : 62, settlement: this.db.balance(shop.ownerId), lowStock: shop.items.filter(i => i.stock <= 3).length };
  }

  // ---------- dispatcher
  /** Run periodically: expands search radius, expires stale requests/offers, times out chosen partners, fires subscriptions and scheduled orders. */
  tick() {
    const t = Date.now();
    for (const o of this.db.openOrders()) {
      if (o.when === 'schedule' && o.scheduledAt && !o.seenIds.length && isDue(o, t) && !this.db.getMeta('announced:' + o.id)) { this.db.setMeta('announced:' + o.id, '1'); this.announce(o); }
      const action = dispatchTick(o, t);
      if (action === 'expand') { const r = apply(o, { type: 'expand_radius', actor: 'system' }); if (r.ok) { this.db.putOrder(r.order); this.announce(r.order); } }
      else if (action === 'expire') { const r = apply(o, { type: 'expire', actor: 'system' }); if (r.ok) this.commit(o, r.order, { type: 'expire', actor: 'system' }); }
      else if (action === 'chosen_timeout') { const r = apply(o, { type: 'chosen_timeout', actor: 'system' }); if (r.ok) this.commit(o, r.order, { type: 'chosen_timeout', actor: 'system' }); }
      if (o.offers.length) { const r = apply(o, { type: 'expire_offers', actor: 'system', now: new Date(t).toISOString() }); if (r.ok && r.order.offers.length !== o.offers.length) { this.db.putOrder(r.order); this.broadcastOrder(r.order); } }
    }
    for (const s of this.db.allSubs()) {
      if (!s.active || Date.parse(s.nextRunAt) > t) continue;
      const user = this.db.getUser(s.customerId); if (!user) continue;
      try {
        this.createOrder(this.ctx(user), { kind: s.template.kind, items: s.template.items.map(i => ({ name: i.name, qty: i.qty, itemId: i.itemId })), shopId: s.template.shopId, mode: s.template.mode, pay: s.template.pay, subs: s.template.subs, note: s.template.note, budget: s.template.budget, addressId: s.template.address.id });
        this.notify(user.id, 'Weekly order placed', s.label);
      } catch (e) { this.notify(user.id, 'Weekly order skipped', (e as Error).message); }
      const next = new Date(s.nextRunAt); next.setDate(next.getDate() + 7);
      this.db.putSub({ ...s, nextRunAt: next.toISOString() });
    }
  }
}

function slotToIso(slot: string | null | undefined): string | null {
  if (!slot) return null;
  const d = new Date();
  const m = /(\d{1,2})(?:–\d{1,2})?\s*(am|pm)/i.exec(slot);
  if (/tomorrow/i.test(slot)) d.setDate(d.getDate() + 1);
  if (m) { let h = Number(m[1]) % 12; if (/pm/i.test(m[2])) h += 12; d.setHours(h, 0, 0, 0); }
  return d.toISOString();
}
