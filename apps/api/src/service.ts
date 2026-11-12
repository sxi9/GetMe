// Application service: the only place that mutates orders. Every change goes
// through the core reducer, is persisted, and fans out as realtime events
// with role-specific redaction.
import {
  ACTIVE, DISPATCH, DomainError, REGIONS, apply, bill, choosablePartners, deliveryFeeForKm, dispatchTick, eligiblePartners, etaMinutes, haversineKm,
  bearing, etaWithTraffic, isDue, itemsTotal, joinableRuns, listDeliveryFee, makeFee, parcelDeliveryFee, promoFor, regionFor, settle, validateParcel, type Address, type Announcement, type Community, type LatLng, type Message, type Notification,
  type CryptoPayment, type Order, type OrderEventInput, type OrderItem, type OrderKind, type Partner, type RegionProfile, type Role, type Run, type Shop, type Subscription, type User,
} from '@getme/core';
import type { Db } from './db.js';
import type { Bus } from './bus.js';
import type { Push, Sms } from './push.js';
import type { Crypto } from './crypto.js';
import { now, otp4, token, uid } from './ids.js';

export interface Ctx { user: User; partner: Partner | null; shop: Shop | null }

export interface CreateOrderInput {
  kind: OrderKind;
  items?: { name: string; qty: number; itemId?: string }[];
  shopId?: string | null;           // list: preferred shop or null for any; shop: the catalogue shop
  addressId?: string;               // drop address (customer's saved address)
  address?: Partial<Address>;       // or an inline drop address (parcels)
  pickupAddressId?: string;         // parcels
  mode: 'broadcast' | 'offers' | 'choose' | 'run';
  runId?: string | null;
  pay: 'cod' | 'upi' | 'card' | 'wallet' | 'crypto';
  idempotencyKey?: string;
  promoCode?: string | null;
  when?: 'now' | 'schedule'; slot?: string | null; scheduledAt?: string | null;
  budget?: number | null; subs?: boolean; repeat?: boolean; anon?: boolean; note?: string;
  receiver?: { name: string; phone: string } | null; pkType?: string | null; pkSize?: string | null; insure?: boolean;
}

export class Service {
  push: Push | null = null;
  sms: Sms | null = null;
  crypto: Crypto | null = null;
  constructor(public db: Db, public bus: Bus) {}

  /** Region profiles with admin overrides applied. */
  regions(): RegionProfile[] {
    const raw = this.db.getMeta('regions'); if (!raw) return REGIONS;
    try { const over = JSON.parse(raw) as Partial<RegionProfile>[]; return REGIONS.map(r => ({ ...r, ...(over.find(o => o.id === r.id) ?? {}) })); } catch { return REGIONS; }
  }
  regionAt(pos: LatLng) { return regionFor(pos, this.regions()); }

  // ---------- helpers
  ctx(user: User): Ctx { return { user, partner: user.role === 'partner' ? this.db.getPartnerByUser(user.id) : null, shop: user.role === 'shop' ? this.db.getShopByOwner(user.id) : null }; }

  /**
   * In-app record + socket toast, then Web Push to the user's devices. When the
   * user has no live socket and no push subscription (or `important`), fall back
   * to SMS so a closed app in a village still hears about it.
   */
  notify(userId: string, title: string, body: string, orderId: string | null = null, opts: { important?: boolean; url?: string } = {}) {
    const n: Notification = { id: uid('n_'), userId, title, body, orderId, read: false, at: now() };
    this.db.putNotification(n);
    const user = this.db.getUser(userId);
    const url = opts.url ?? (user && orderId ? `/${user.role}/order/${orderId}` : user ? `/${user.role}` : '/');
    this.bus.send(userId, { type: 'notify', title, body, orderId, url } as any);
    if (!user || !user.pushEnabled) return;
    void (async () => {
      const delivered = this.push ? await this.push.send(userId, { title, body, url, tag: orderId ?? undefined }) : 0;
      if (!delivered && (opts.important || !this.bus.online(userId)) && user.phone && this.sms) await this.sms.send(user.phone, `GetMe: ${title}${body ? ' – ' + body : ''}`);
    })();
  }

  partnerUser(partnerId: string | null) { return partnerId ? this.db.getPartner(partnerId)?.userId ?? null : null; }
  shopOwner(shopId: string | null) { return shopId ? this.db.getShop(shopId)?.ownerId ?? null : null; }

  /** Role-specific projection of an order. */
  view(o: Order, role: Role | 'public', viewer?: Ctx): any {
    const shopStatus = o.kind === 'shop' ? this.db.getShopStatus(o.id) : null;
    const courier = o.courierId ? this.db.getPartner(o.courierId) : null;
    const target: LatLng | null = o.status === 'to_shop' ? (o.shopPos ?? null) : o.status === 'to_customer' ? o.address : null;
    const courierPos = courier?.pos ?? null;
    const regionKind = this.regions().find(r => r.id === o.regionId)?.kind ?? 'city';
    const eta = target && courierPos ? etaWithTraffic(haversineKm(courierPos, target), { kind: regionKind, observedKmh: courier?.speedKmh }) : null;
    const etaMin = eta?.min ?? null;
    const run = o.runId ? this.db.getRun(o.runId) : null;
    const base = { ...o, bill: bill(o), shopStatus, courierPos, etaMin, traffic: eta?.level ?? null, courierHeading: courier?.heading ?? null, courierSpeedKmh: courier?.speedKmh ?? null, courierTrail: courier?.trail ?? [], courierVehicle: courier?.vehicle ?? null, run: run ? { id: run.id, label: run.label, destination: run.destination, departAt: run.departAt, status: run.status } : null, courier: courier ? { id: courier.id, name: courier.name, initials: courier.initials, vehicle: courier.vehicle, plate: courier.plate, rating: courier.rating, trips: courier.trips } : null };
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
      return { id: o.id, kind: o.kind, customerName, items: o.items, itemsTotal: o.itemsTotal, status: o.status, shopStatus, courierName: o.courierName, createdAt: o.createdAt, times: o.times, note: o.note, subs: o.subs, run: base.run, handoff: o.address.handoff ?? 'in_person', pay: o.pay };
    }
    // public tracking link
    return { id: o.id, kind: o.kind, status: o.status, shopName: o.shopName, shopPos: o.shopPos, address: { line: o.address.line, lat: o.address.lat, lng: o.address.lng }, courier: base.courier, courierPos, etaMin, traffic: base.traffic, courierHeading: base.courierHeading, courierTrail: base.courierTrail, courierVehicle: base.courierVehicle, podPhotoUrl: o.podPhotoUrl, times: o.times, receiver: o.receiver ? { name: o.receiver.name } : null };
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
    const region = this.regionAt(addr);
    const run = input.runId ? this.db.getRun(input.runId) : null;
    if (input.mode === 'run') { if (!run) throw new DomainError('no_run', 'That trip is no longer available'); if (!joinableRuns([run], addr, ctx.user.communityId, Date.now()).length) throw new DomainError('run_closed', 'That trip is full or closed'); }
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
      delivery = deliveryFeeForKm(haversineKm(shop.pos, addr), 1, region);
    } else {
      items = (input.items ?? []).map(i => ({ name: i.name.trim(), qty: Math.max(1, Math.round(i.qty || 1)), unit: '', price: null })).filter(i => i.name);
      delivery = listDeliveryFee(shop ? haversineKm(shop.pos, addr) : null, 1, region);
    }
    if (run) delivery = run.feePerOrder;
    if (!items.length) throw new DomainError('empty', 'Add at least one item');
    const total = itemsTotal(items);
    const promo = promoFor(input.promoCode, input.kind, delivery);
    const fee = makeFee(delivery, insure);
    const draft = { fee, promo: promo.discount, itemCost: null, itemsTotal: input.kind === 'parcel' ? 0 : total, kind: input.kind };
    return { items, itemsTotal: total, fee, promo: promo.discount, promoMsg: promo.reason || (promo.discount ? `₹${promo.discount} off delivery applied` : ''), bill: bill(draft), shop: shop ? { id: shop.id, name: shop.name, distKm: haversineKm(shop.pos, addr) } : null, address: addr, region: { id: region.id, name: region.name, kind: region.kind, defaultPay: region.defaultPay, defaultMode: region.defaultMode }, run: run ? { id: run.id, label: run.label, departAt: run.departAt, feePerOrder: run.feePerOrder } : null };
  }

  private resolveAddress(ctx: Ctx, input: CreateOrderInput): Address {
    if (input.addressId) {
      const a = this.db.addresses(ctx.user.id).find(x => x.id === input.addressId);
      if (!a) throw new DomainError('no_address', 'Address not found');
      return a;
    }
    if (input.address?.line || (input.address?.lat != null && input.address?.lng != null)) {
      // inline address: GPS / pin / typed. Without coordinates (typed only) the drop sits a little north-west of home until geocoded.
      const home = this.db.addresses(ctx.user.id)[0];
      const a = input.address;
      return { ...a, id: a.id, label: a.label ?? 'Drop', line: a.line || a.landmark || 'Pinned location', area: a.area, lat: a.lat ?? (home?.lat ?? 12.9121) + 0.02, lng: a.lng ?? (home?.lng ?? 77.6446) - 0.02, handoff: a.handoff ?? 'in_person' } as Address;
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
    if (input.idempotencyKey) { const prev = this.db.getMeta('idem:' + input.idempotencyKey); if (prev) { const o = this.db.getOrder(prev); if (o) return o; } }
    const q = this.quote(ctx, input);
    const region = this.regionAt(q.address);
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
      mode: input.mode, runId: null, regionId: region.id, dispatch: { radiusKm: region.radiusKm, expandEveryMs: region.expandEveryMs, expireAfterMs: region.expireAfterMs },
      pay: input.pay, promoCode: q.promo ? (input.promoCode ?? '').toUpperCase() : null, promo: q.promo,
      when: input.when ?? 'now', slot: input.slot ?? null, scheduledAt: input.when === 'schedule' ? (input.scheduledAt ?? slotToIso(input.slot)) : null,
      budget: input.budget ?? null, subs: input.subs ?? true, repeat: !!input.repeat, note: input.note ?? '', receiver: input.receiver ?? null,
      pkType: input.pkType ?? null, pkSize: input.pkSize ?? null,
      status: 'requesting', courierId: null, courierName: null, chosenId: null, offers: [], counter: null, declinedIds: [], seenIds: [],
      fee: q.fee, itemCost: null, receiptUrl: null, pickupPhotoUrl: null, otp: otp4(), cashCollected: false, podPhotoUrl: null, crypto: null, idempotencyKeys: [], tip: 0, rating: null, customerRating: null,
      issue: null, refund: null, cancelReason: null, cancelledBy: null, times: { requesting: t }, searchRadiusKm: region.radiusKm[0], createdAt: t, updatedAt: t,
    };
    this.db.putOrder(o);
    if (input.idempotencyKey) this.db.setMeta('idem:' + input.idempotencyKey, o.id);
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
    if (o.mode === 'run' && q.run) return this.attachToRun(o, q.run.id);
    if (isDue(o)) this.announce(o);
    if (o.kind === 'parcel' && o.receiver?.phone && this.sms) void this.sms.send(o.receiver.phone, `GetMe: ${o.customerName.split(' ')[0]} is sending you a package (${o.id}). Handover code: ${o.otp}. Track: ${process.env.PUBLIC_URL ?? ''}/track/${this.shareLink(ctx, o.id)}`);
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
  event(ctx: Ctx, orderId: string, ev: OrderEventInput, idempotencyKey?: string): Order {
    const o = this.db.getOrder(orderId);
    if (!o) throw new DomainError('not_found', 'Order not found');
    if (idempotencyKey && o.idempotencyKeys.includes(idempotencyKey)) return o; // offline replay of an event already applied
    const role = ctx.user.role;
    if (role === 'admin') { const r = apply(o, { ...ev, actor: ev.type === 'cancel' ? 'system' : ev.actor } as OrderEventInput); if (!r.ok) throw new DomainError(r.code, r.message); return this.commit(o, r.order, ev); }
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
    const next = idempotencyKey ? { ...r.order, idempotencyKeys: [...r.order.idempotencyKeys.slice(-20), idempotencyKey] } : r.order;
    return this.commit(o, next, ev);
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
        arrived: [`${cn} has arrived`, parcel ? 'Share the handover code with the receiver' : (next.address.handoff ?? 'in_person') === 'in_person' ? `Share your handover code ${next.otp}` : 'Leaving it as you asked, with a photo'],
        delivered: ['Delivered', 'Rate your experience'],
        expired: ['No partner found', 'Nobody accepted in time. Try again or widen your options'],
        counter: [`${first(next.counter?.partnerName ?? 'Partner')} asks for ₹${next.counter?.amount} extra`, next.counter?.reason ?? ''],
      };
      const m = msg[next.status];
      if (m) this.notify(next.customerId, m[0], m[1], next.id, { important: next.status === 'arrived' || next.status === 'delivered' || next.status === 'expired' });
      if (next.runId && (next.status === 'delivered' || next.status === 'cancelled')) this.maybeFinishRun(next.runId);
      if (next.status === 'to_customer') this.pushMessage(next, 'partner', 'text', parcel ? 'Picked up the package. On my way to the receiver.' : 'Got everything on the list. On my way.');
      if (next.pay === 'crypto' && (next.status === 'to_customer' || next.status === 'arrived')) void this.ensureCryptoInvoice(next.id);
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
      if (p && p.activeOrderId === next.id) this.db.putPartner({ ...p, activeOrderId: p.activeRunId ? this.nextRunOrderId(p.activeRunId, next.id) : null, trips: next.status === 'delivered' ? p.trips + 1 : p.trips });
    }
    if (next.status === 'cancelled') {
      const cu = this.partnerUser(prev.courierId);
      if (cu) this.notify(cu, `Request ${next.id} was cancelled`, `by the ${next.cancelledBy}`, next.id);
      if (next.kind === 'shop' && next.shopId) { this.notify(this.shopOwner(next.shopId)!, `Order ${next.id} cancelled`, '', next.id); this.restock(next); }
      if (next.cancelledBy !== 'customer') this.notify(next.customerId, `Order ${next.id} cancelled`, next.cancelReason ?? '', next.id);
    }
    if (next.status === 'expired' && next.kind === 'shop' && next.shopId) this.restock(next);
    if (next.status === 'delivered' && prev.status !== 'delivered') { this.settleOrder(next); if (next.kind === 'parcel' && next.receiver?.phone && this.sms) void this.sms.send(next.receiver.phone, `GetMe: package ${next.id} delivered${next.podPhotoUrl ? ' (photo on the tracking link)' : ''}.`); }
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
    const p = ctx.partner!; const t = now();
    let heading = p.heading, speedKmh = p.speedKmh;
    if (p.pos && p.posAt) {
      const km = haversineKm(p.pos, pos), hrs = Math.max(1, Date.parse(t) - Date.parse(p.posAt)) / 3.6e6;
      if (km > 0.008) { heading = bearing(p.pos, pos); speedKmh = Math.round(Math.min(80, km / hrs)); }
      else if (hrs > 60 / 3.6e6 * 1000) speedKmh = 0; // stationary for a while
    }
    const trail = [...(p.trail ?? []), pos].slice(-12);
    const next = { ...p, pos, posAt: t, heading, speedKmh, trail };
    this.db.putPartner(next);
    if (p.activeOrderId) {
      const o = this.db.getOrder(p.activeOrderId);
      if (o) { const ev = { type: 'location.updated' as const, orderId: o.id, partnerId: p.id, pos, heading, speedKmh, trail }; this.bus.send(o.customerId, ev); const tok = this.db.getMeta('share:' + o.id); if (tok) this.bus.send('track:' + tok, ev); }
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

  // ---------- crypto invoices
  /** Create (or renew) the stablecoin invoice for the order's final bill. Safe to call repeatedly. */
  async ensureCryptoInvoice(orderId: string, currency: 'USDT' | 'USDC' = 'USDT'): Promise<Order | null> {
    const o = this.db.getOrder(orderId); if (!o || o.pay !== 'crypto' || !this.crypto) return o;
    if (o.crypto && o.crypto.purpose === 'order' && (o.crypto.status === 'paid' || o.crypto.status === 'confirming')) return o;
    if (o.crypto && o.crypto.status === 'pending' && Date.parse(o.crypto.expiresAt) > Date.now() && o.crypto.amountInr === bill(o).total && o.crypto.currency === currency) return o;
    const inv = await this.crypto.createInvoice(o.id, 'order', bill(o).total, currency);
    const next = { ...o, crypto: inv, updatedAt: now() };
    this.db.putOrder(next);
    this.notify(o.customerId, `Pay ${inv.amountCrypto} ${inv.currency} to complete your order`, `₹${inv.amountInr} · the partner hands over once the payment confirms`, o.id, { important: true });
    this.broadcastOrder(next);
    return next;
  }
  async cryptoStatus(ctx: Ctx, orderId: string): Promise<Order> {
    const o = this.db.getOrder(orderId); if (!o || o.customerId !== ctx.user.id) throw new DomainError('not_found', 'Order not found');
    if (!o.crypto || !this.crypto) return o;
    const inv = await this.crypto.refreshStatus(o.crypto);
    if (inv.status !== o.crypto.status) return this.applyCrypto(o, inv);
    return o;
  }
  applyCrypto(o: Order, inv: CryptoPayment): Order {
    const next = { ...o, crypto: inv, updatedAt: now() };
    this.db.putOrder(next);
    if (inv.status === 'paid' && o.crypto?.status !== 'paid') {
      this.notify(o.customerId, 'Crypto payment confirmed', `${inv.amountCrypto} ${inv.currency} received${inv.txHash ? ' · ' + inv.txHash.slice(0, 10) + '…' : ''}`, o.id);
      const cu = this.partnerUser(o.courierId); if (cu) this.notify(cu, 'Customer paid in crypto', 'You can complete the handover now', o.id, { important: true });
      if (inv.purpose === 'order' && o.pay === 'crypto') this.db.putLedger({ id: uid('l_'), userId: o.customerId, orderId: o.id, kind: 'charge', amount: 0, note: `${o.id} · ${inv.amountCrypto} ${inv.currency} (₹${inv.amountInr}) · ${inv.provider}`, at: now() });
    }
    if (inv.status === 'expired') this.notify(o.customerId, 'Crypto invoice expired', 'Open the order to get a fresh payment address', o.id, { important: true });
    this.broadcastOrder(next);
    return next;
  }
  /** Webhook / simulate entry: find the order by invoice id and apply the provider status. */
  cryptoProviderUpdate(invoiceId: string, status: string, txHash: string | null): Order | null {
    const o = this.db.allOrders(1000).find(x => x.crypto?.invoiceId === invoiceId); if (!o || !o.crypto || !this.crypto) return null;
    return this.applyCrypto(o, this.crypto.applyProviderStatus(o.crypto, status, txHash));
  }

  // ---------- runs (a partner's announced trip; orders ride along)
  createRun(ctx: Ctx, input: { label: string; destination: string; destinationPos?: LatLng | null; departAt: string; cutoffAt?: string; capacity?: number; feePerOrder: number; communityOnly?: boolean; note?: string; fromAddress?: Partial<Address> }): Run {
    const p = ctx.partner; if (!p) throw new DomainError('forbidden', 'Partners only');
    if (!p.verified) throw new DomainError('unverified', 'Finish verification before announcing a trip');
    if (p.activeRunId) throw new DomainError('busy', 'Finish your current trip first');
    if (!(input.label || '').trim() || !(input.destination || '').trim()) throw new DomainError('invalid', 'Give the trip a name and a destination');
    const depart = Date.parse(input.departAt); if (!(depart > Date.now())) throw new DomainError('invalid', 'Departure must be in the future');
    const fee = Math.round(Number(input.feePerOrder)); if (!(fee >= 10)) throw new DomainError('invalid', 'Fee per order must be at least ₹10');
    const t = now();
    const from: Address = { label: 'Start', line: input.fromAddress?.line ?? p.area, lat: input.fromAddress?.lat ?? p.pos?.lat ?? 12.9121, lng: input.fromAddress?.lng ?? p.pos?.lng ?? 77.6446, area: input.fromAddress?.area };
    const run: Run = { id: uid('run_'), partnerId: p.id, partnerName: p.name, label: input.label.trim(), destination: input.destination.trim(), destinationPos: input.destinationPos ?? null, from, departAt: new Date(depart).toISOString(), cutoffAt: input.cutoffAt ? new Date(input.cutoffAt).toISOString() : new Date(depart - 30 * 60_000).toISOString(), capacity: Math.max(1, Math.min(30, Math.round(Number(input.capacity) || 6))), feePerOrder: fee, communityId: input.communityOnly ? (ctx.user.communityId ?? null) : null, status: 'open', orderIds: [], note: (input.note ?? '').trim(), createdAt: t, updatedAt: t };
    this.db.putRun(run);
    this.broadcastRun(run);
    // tell the community (notice board) and nearby customers
    const audience = run.communityId ? this.db.usersInCommunity(run.communityId) : this.db.usersByRole('customer').filter(u => { const a = this.db.addresses(u.id)[0]; return a && haversineKm(a, from) <= 15; });
    for (const u of audience) if (u.id !== ctx.user.id) this.notify(u.id, `${p.name.split(' ')[0]} is going to ${run.destination}`, `Leaves ${new Date(run.departAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · ₹${fee} per order · add your list`, null, { url: `/customer/runs/${run.id}` });
    if (run.communityId) this.announce_(run.communityId, ctx.user, `Going to ${run.destination} at ${new Date(run.departAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Add your list to my trip.`, run.id);
    return run;
  }
  broadcastRun(run: Run) {
    const ids = new Set<string>([this.db.getPartner(run.partnerId)?.userId ?? '']);
    for (const id of run.orderIds) { const o = this.db.getOrder(id); if (o) ids.add(o.customerId); }
    if (run.communityId) for (const u of this.db.usersInCommunity(run.communityId)) ids.add(u.id);
    ids.delete('');
    this.bus.sendMany(ids, { type: 'run.updated', run });
  }
  runsFor(ctx: Ctx, pos?: LatLng) {
    const at = pos ?? this.db.addresses(ctx.user.id)[0] ?? { lat: 12.9121, lng: 77.6446 };
    return joinableRuns(this.db.openRuns(), at, ctx.user.communityId, Date.now()).map(r => this.runView(r, ctx));
  }
  runView(r: Run, ctx?: Ctx) {
    const p = this.db.getPartner(r.partnerId);
    const orders = r.orderIds.map(id => this.db.getOrder(id)).filter(Boolean) as Order[];
    const mine = ctx?.user.role === 'customer' ? orders.filter(o => o.customerId === ctx.user.id).map(o => o.id) : [];
    return { ...r, partner: p ? { id: p.id, name: p.name, initials: p.initials, photoUrl: p.photoUrl, rating: p.rating, trips: p.trips, vehicle: p.vehicle, tier: p.tier } : null, seats: r.capacity - r.orderIds.length, myOrderIds: mine, orders: ctx?.user.role === 'partner' || ctx?.user.role === 'admin' ? orders.map(o => this.view(o, 'partner', ctx)) : undefined };
  }
  attachToRun(o: Order, runId: string): Order {
    const run = this.db.getRun(runId); if (!run) throw new DomainError('no_run', 'Trip not found');
    const p = this.db.getPartner(run.partnerId)!;
    const r = apply(o, { type: 'attach_run', actor: 'system', partnerId: p.id, partnerName: p.name, runId, price: run.feePerOrder });
    if (!r.ok) throw new DomainError(r.code, r.message);
    const next = this.commit(o, r.order, { type: 'attach_run', actor: 'system', partnerId: p.id, partnerName: p.name, runId, price: run.feePerOrder });
    const updated = { ...run, orderIds: [...run.orderIds, o.id], updatedAt: now() };
    this.db.putRun(updated); this.broadcastRun(updated);
    this.notify(p.userId, `${o.anon ? 'A neighbour' : o.customerName.split(' ')[0]} joined your trip`, `${o.items.length} item${o.items.length > 1 ? 's' : ''} · ${run.orderIds.length + 1} of ${run.capacity} seats`, o.id, { url: `/partner/runs/${run.id}` });
    this.notify(o.customerId, `You are on ${p.name.split(' ')[0]}'s trip`, `Leaves ${new Date(run.departAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · ₹${run.feePerOrder} delivery`, o.id);
    return next;
  }
  /** Partner starts the trip: every attached order becomes an active job, worked one at a time. */
  startRun(ctx: Ctx, runId: string): Run {
    const run = this.db.getRun(runId); const p = ctx.partner!;
    if (!run || run.partnerId !== p.id) throw new DomainError('not_found', 'Trip not found');
    if (run.status !== 'open' && run.status !== 'closed') throw new DomainError('bad_state', 'Trip already started');
    const orders = run.orderIds.map(id => this.db.getOrder(id)!).filter(o => o.status === 'scheduled');
    if (!orders.length) { const done = { ...run, status: 'cancelled' as const, updatedAt: now() }; this.db.putRun(done); this.broadcastRun(done); throw new DomainError('empty', 'Nobody joined this trip. It has been cancelled'); }
    for (const o of orders) { const r = apply(o, { type: 'start_run', actor: 'partner', partnerId: p.id }); if (r.ok) this.commit(o, r.order, { type: 'start_run', actor: 'partner', partnerId: p.id }); }
    const started = { ...run, status: 'in_progress' as const, updatedAt: now() };
    this.db.putRun(started);
    this.db.putPartner({ ...this.db.getPartner(p.id)!, activeRunId: run.id, activeOrderId: orders[0].id });
    this.bus.send(p.userId, { type: 'partner.updated', partner: this.db.getPartner(p.id)! });
    this.broadcastRun(started);
    return started;
  }
  nextRunOrderId(runId: string, justFinished: string): string | null {
    const run = this.db.getRun(runId); if (!run) return null;
    const next = run.orderIds.map(id => this.db.getOrder(id)!).find(o => o.id !== justFinished && ACTIVE.has(o.status));
    return next?.id ?? null;
  }
  /** Partner switches which order of the run they are working on. */
  focusRunOrder(ctx: Ctx, runId: string, orderId: string) {
    const run = this.db.getRun(runId); const p = ctx.partner!;
    if (!run || run.partnerId !== p.id || !run.orderIds.includes(orderId)) throw new DomainError('not_found', 'Not on this trip');
    this.db.putPartner({ ...this.db.getPartner(p.id)!, activeOrderId: orderId });
    this.bus.send(p.userId, { type: 'partner.updated', partner: this.db.getPartner(p.id)! });
  }
  maybeFinishRun(runId: string) {
    const run = this.db.getRun(runId); if (!run || run.status !== 'in_progress') return;
    const open = run.orderIds.map(id => this.db.getOrder(id)!).filter(o => ACTIVE.has(o.status) || o.status === 'scheduled');
    if (open.length) return;
    const done = { ...run, status: 'done' as const, updatedAt: now() };
    this.db.putRun(done);
    const p = this.db.getPartner(run.partnerId)!;
    this.db.putPartner({ ...p, activeRunId: null, activeOrderId: null });
    this.bus.send(p.userId, { type: 'partner.updated', partner: this.db.getPartner(p.id)! });
    this.notify(p.userId, 'Trip complete', `${run.label} · ${run.orderIds.length} orders`, null, { url: '/partner/earnings' });
    this.broadcastRun(done);
  }
  cancelRun(ctx: Ctx, runId: string, reason = 'Trip cancelled by the partner'): Run {
    const run = this.db.getRun(runId);
    if (!run || (ctx.user.role !== 'admin' && run.partnerId !== ctx.partner?.id)) throw new DomainError('not_found', 'Trip not found');
    if (run.status === 'in_progress' || run.status === 'done') throw new DomainError('bad_state', 'Trip already started');
    for (const id of run.orderIds) {
      const o = this.db.getOrder(id); if (!o || o.status !== 'scheduled') continue;
      const r = apply(o, { type: 'detach_run', actor: 'system', reason });
      if (r.ok) { const next = this.commit(o, r.order, { type: 'detach_run', actor: 'system', reason }); this.notify(o.customerId, 'Trip cancelled', 'Your order is now being sent to partners nearby instead', o.id, { important: true }); this.announce(next); }
    }
    const cancelled = { ...run, status: 'cancelled' as const, updatedAt: now() };
    this.db.putRun(cancelled); this.broadcastRun(cancelled);
    return cancelled;
  }
  closeRun(ctx: Ctx, runId: string): Run {
    const run = this.db.getRun(runId); if (!run || run.partnerId !== ctx.partner?.id) throw new DomainError('not_found', 'Trip not found');
    if (run.status !== 'open') throw new DomainError('bad_state', 'Trip is not open');
    const closed = { ...run, status: 'closed' as const, updatedAt: now() }; this.db.putRun(closed); this.broadcastRun(closed); return closed;
  }

  // ---------- communities (apartment societies, villages)
  createCommunity(ctx: Ctx, input: { name: string; kind: Community['kind']; address: string; pos?: LatLng | null }): Community {
    if (!(input.name || '').trim()) throw new DomainError('invalid', 'Give the community a name');
    const pos = input.pos ?? this.db.addresses(ctx.user.id)[0] ?? { lat: 12.9121, lng: 77.6446 };
    const code = (input.name.replace(/[^a-z]/gi, '').slice(0, 6).toUpperCase() || 'GETME') + String(Math.floor(100 + Math.random() * 900));
    const c: Community = { id: uid('com_'), name: input.name.trim(), kind: input.kind ?? 'apartment', address: (input.address ?? '').trim(), pos: { lat: pos.lat, lng: pos.lng }, joinCode: code, adminIds: [ctx.user.id], memberCount: 1, regionId: this.regionAt(pos).id, createdAt: now() };
    this.db.putCommunity(c);
    this.db.putUser({ ...ctx.user, communityId: c.id });
    return c;
  }
  joinCommunity(ctx: Ctx, code: string): Community {
    const c = this.db.communityByCode((code || '').trim()); if (!c) throw new DomainError('not_found', 'No community with that code');
    if (ctx.user.communityId === c.id) return c;
    this.db.putUser({ ...ctx.user, communityId: c.id });
    if (ctx.partner) this.db.putPartner({ ...ctx.partner, communityId: c.id });
    const updated = { ...c, memberCount: this.db.usersInCommunity(c.id).length }; this.db.putCommunity(updated);
    return updated;
  }
  leaveCommunity(ctx: Ctx) { if (!ctx.user.communityId) return; const c = this.db.getCommunity(ctx.user.communityId); this.db.putUser({ ...ctx.user, communityId: null }); if (ctx.partner) this.db.putPartner({ ...ctx.partner, communityId: null }); if (c) this.db.putCommunity({ ...c, memberCount: Math.max(0, c.memberCount - 1) }); }
  board(ctx: Ctx) {
    const cid = ctx.user.communityId; if (!cid) return null;
    const c = this.db.getCommunity(cid); if (!c) return null;
    const runs = this.db.openRuns().filter(r => r.communityId === cid || haversineKm(r.from, c.pos) <= 5).map(r => this.runView(r, ctx));
    return { community: c, announcements: this.db.announcements(cid), runs, members: this.db.usersInCommunity(cid).map(u => ({ id: u.id, name: u.name, role: u.role, photoUrl: u.photoUrl ?? null })) };
  }
  announce_(communityId: string, author: User, text: string, runId: string | null = null): Announcement {
    const a: Announcement = { id: uid('an_'), communityId, authorId: author.id, authorName: author.name, text: text.trim(), runId, at: now() };
    this.db.putAnnouncement(a);
    this.bus.sendMany(this.db.usersInCommunity(communityId).map(u => u.id), { type: 'announcement', announcement: a });
    return a;
  }
  postAnnouncement(ctx: Ctx, text: string): Announcement {
    if (!ctx.user.communityId) throw new DomainError('no_community', 'Join a community first');
    if (!(text || '').trim()) throw new DomainError('invalid', 'Write something');
    const a = this.announce_(ctx.user.communityId, ctx.user, text);
    for (const u of this.db.usersInCommunity(ctx.user.communityId)) if (u.id !== ctx.user.id) this.notify(u.id, ctx.user.name.split(' ')[0] + ' posted on the notice board', text.slice(0, 80), null, { url: `/${u.role}/community` });
    return a;
  }

  // ---------- admin
  adminOverview() {
    const partners = this.db.listPartners();
    return {
      live: this.db.liveOrders().map(o => ({ ...this.view(o, 'customer'), otp: undefined })),
      pendingPartners: partners.filter(p => p.verification === 'pending'),
      pendingShops: this.db.listShops().filter(s => !s.approved),
      refunds: this.db.refundRequests().map(o => this.view(o, 'customer')),
      partnersOnline: partners.filter(p => p.online).length, partners: partners.length,
      ordersToday: this.db.allOrders(500).filter(o => o.createdAt.slice(0, 10) === now().slice(0, 10)).length,
      runs: this.db.openRuns().map(r => this.runView(r)),
      regions: this.regions(), sms: this.db.smsLog(20), communities: this.db.listCommunities(),
    };
  }
  verifyPartner(partnerId: string, decision: 'verified' | 'rejected', note = '') {
    const p = this.db.getPartner(partnerId); if (!p) throw new DomainError('not_found', 'Partner not found');
    const next = { ...p, verification: decision, verified: decision === 'verified', verificationNote: note || null };
    this.db.putPartner(next);
    this.bus.send(p.userId, { type: 'partner.updated', partner: next });
    this.notify(p.userId, decision === 'verified' ? 'You are verified' : 'Verification not approved', decision === 'verified' ? 'Go online to start taking requests' : (note || 'Upload clearer documents and try again'), null, { important: true, url: '/partner/profile' });
    return next;
  }
  approveShop(shopId: string, approved: boolean) {
    const s = this.db.getShop(shopId); if (!s) throw new DomainError('not_found', 'Shop not found');
    const next = { ...s, approved }; this.db.putShop(next); this.bus.send(s.ownerId, { type: 'shop.updated', shop: next });
    this.notify(s.ownerId, approved ? 'Your shop is live on GetMe' : 'Shop listing paused', approved ? 'Customers nearby can now order from your catalogue' : 'Contact support for details', null, { important: true });
    return next;
  }
  resolveRefund(orderId: string, approve: boolean, amount?: number) {
    const o = this.db.getOrder(orderId); if (!o || !o.refund) throw new DomainError('not_found', 'No refund request on this order');
    const amt = approve ? Math.max(0, Math.round(amount ?? o.refund.amount)) : 0;
    const next = { ...o, refund: { amount: amt, status: approve ? 'approved' as const : 'rejected' as const }, updatedAt: now() };
    this.db.putOrder(next);
    if (approve && amt > 0) { this.db.putLedger({ id: uid('l_'), userId: o.customerId, orderId: o.id, kind: 'refund', amount: amt, note: `Refund ${o.id} · ${o.issue}`, at: now() }); this.bus.send(o.customerId, { type: 'wallet.updated', balance: this.db.balance(o.customerId) }); }
    this.notify(o.customerId, approve ? `Refund of ₹${amt} approved` : 'Refund request reviewed', approve ? 'Added to your GetMe wallet' : 'We could not approve this request. Reply to this message to talk to support', o.id, { important: true });
    this.bus.send(o.customerId, { type: 'order.updated', order: this.view(next, 'customer') });
    return next;
  }
  setRegionOverrides(over: Partial<RegionProfile>[]) { this.db.setMeta('regions', JSON.stringify(over)); return this.regions(); }

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
    for (const r of this.db.openRuns()) {
      if (r.status === 'open' && Date.parse(r.cutoffAt) <= t) { const closed = { ...r, status: 'closed' as const, updatedAt: now() }; this.db.putRun(closed); this.broadcastRun(closed); const p = this.db.getPartner(r.partnerId); if (p) this.notify(p.userId, 'Trip closed for new orders', `${r.orderIds.length} order${r.orderIds.length === 1 ? '' : 's'} to pick up. Start the trip when you leave`, null, { url: `/partner/runs/${r.id}` }); }
      if (Date.parse(r.departAt) + 2 * 3600_000 <= t) { try { this.cancelRun({ user: { role: 'admin' } as User, partner: null, shop: null }, r.id, 'The trip did not start'); } catch { /* already handled */ } }
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
