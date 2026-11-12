// Order state machine — one reducer for every role. The API validates with
// `canApply` and mutates with `apply`; the apps use `canApply` to decide what
// to show. Every event names its actor so the same table enforces permissions.

import { DISPATCH } from './constants.js';
import type { Counter, Offer, Order, OrderStatus, Role } from './types.js';

export class DomainError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'DomainError'; }
}

export type OrderEventInput =
  // customer
  | { type: 'cancel'; actor: 'customer' | 'system' | 'shop'; reason?: string }
  | { type: 'choose_partner'; actor: 'customer'; partnerId: string }
  | { type: 'accept_offer'; actor: 'customer'; partnerId: string }
  | { type: 'approve_counter'; actor: 'customer' }
  | { type: 'decline_counter'; actor: 'customer' }
  | { type: 'tip'; actor: 'customer'; amount: number }
  | { type: 'rate'; actor: 'customer'; stars: number; tags: string[] }
  | { type: 'report_issue'; actor: 'customer'; issue: string }
  // partner
  | { type: 'seen'; actor: 'partner'; partnerId: string }
  | { type: 'accept'; actor: 'partner'; partnerId: string; partnerName: string }
  | { type: 'decline'; actor: 'partner'; partnerId: string }
  | { type: 'counter'; actor: 'partner'; partnerId: string; partnerName: string; amount: number; reason: string }
  | { type: 'offer'; actor: 'partner'; partnerId: string; partnerName: string; price: number; etaMin: number }
  | { type: 'reached'; actor: 'partner'; partnerId: string }
  | { type: 'check_item'; actor: 'partner'; partnerId: string; index: number; bought: boolean; unavailable?: boolean; substitute?: string | null }
  | { type: 'bought'; actor: 'partner'; partnerId: string; itemCost: number | null; receiptUrl: string | null }
  | { type: 'arrived'; actor: 'partner'; partnerId: string }
  | { type: 'complete'; actor: 'partner'; partnerId: string; otp: string; cashCollected: boolean }
  | { type: 'rate_customer'; actor: 'partner'; partnerId: string; stars: number }
  | { type: 'unassign'; actor: 'partner' | 'system'; partnerId: string; reason: string }
  // system
  | { type: 'assign'; actor: 'system'; partnerId: string; partnerName: string; price?: number }
  | { type: 'expand_radius'; actor: 'system' }
  | { type: 'expire'; actor: 'system' }
  | { type: 'expire_offers'; actor: 'system'; now: string }
  | { type: 'chosen_timeout'; actor: 'system' };

export type ApplyResult = { ok: true; order: Order } | { ok: false; code: string; message: string };

const CANCELLABLE: ReadonlySet<OrderStatus> = new Set(['requesting', 'counter', 'to_shop']);

export function isCancellable(o: Order, by: Role | 'system'): boolean {
  if (by === 'customer' || by === 'system') return CANCELLABLE.has(o.status);
  if (by === 'shop') return o.status === 'requesting' || o.status === 'counter' || o.status === 'to_shop';
  return false;
}

function stamp(o: Order, status: OrderStatus, now: string): Order {
  return { ...o, status, times: { ...o.times, [status]: now }, updatedAt: now };
}

function assign(o: Order, partnerId: string, partnerName: string, now: string, price?: number): Order {
  const next = stamp({ ...o, courierId: partnerId, courierName: partnerName, chosenId: null, counter: null, offers: [], fee: { ...o.fee, delivery: price ?? o.fee.delivery } }, 'to_shop', now);
  return next;
}

function requireCourier(o: Order, partnerId: string): string | null {
  if (o.courierId !== partnerId) return 'This job belongs to another partner';
  return null;
}

/** Pure reducer. Returns a new order or a typed failure. `now` is injected for testability. */
export function apply(o: Order, ev: OrderEventInput, now: string = new Date().toISOString()): ApplyResult {
  const fail = (code: string, message: string): ApplyResult => ({ ok: false, code, message });
  const ok = (order: Order): ApplyResult => ({ ok: true, order: { ...order, updatedAt: now } });
  const open = o.status === 'requesting' || o.status === 'counter';

  switch (ev.type) {
    case 'cancel': {
      if (!isCancellable(o, ev.actor)) return fail('not_cancellable', 'This order can no longer be cancelled');
      return ok({ ...stamp(o, 'cancelled', now), cancelledBy: ev.actor, cancelReason: ev.reason ?? null });
    }
    case 'choose_partner': {
      if (o.mode !== 'choose') return fail('wrong_mode', 'This order is not in choose mode');
      if (!open) return fail('not_open', 'The request is no longer open');
      if (o.declinedIds.includes(ev.partnerId)) return fail('declined', 'This partner already declined');
      return ok({ ...stamp(o, 'requesting', now), chosenId: ev.partnerId, counter: null });
    }
    case 'accept_offer': {
      if (o.mode !== 'offers') return fail('wrong_mode', 'This order is not in offers mode');
      if (!open) return fail('not_open', 'The request is no longer open');
      const off = o.offers.find(x => x.partnerId === ev.partnerId);
      if (!off) return fail('no_offer', 'That offer is no longer available');
      return ok(assign(o, off.partnerId, off.partnerName, now, off.price));
    }
    case 'approve_counter': {
      if (o.status !== 'counter' || !o.counter) return fail('no_counter', 'No extra-fee request to approve');
      const c = o.counter;
      return ok(assign({ ...o, fee: { ...o.fee, extra: c.amount, extraReason: c.reason } }, c.partnerId, c.partnerName, now));
    }
    case 'decline_counter': {
      if (o.status !== 'counter' || !o.counter) return fail('no_counter', 'No extra-fee request to decline');
      // request stays open; partner may still accept at the base fee
      return ok({ ...stamp(o, 'requesting', now), counter: null });
    }
    case 'tip': {
      if (o.status !== 'delivered') return fail('not_delivered', 'Tips are added after delivery');
      if (ev.amount < 0) return fail('bad_amount', 'Tip cannot be negative');
      return ok({ ...o, tip: ev.amount });
    }
    case 'rate': {
      if (o.status !== 'delivered') return fail('not_delivered', 'Rate the partner after delivery');
      if (ev.stars < 1 || ev.stars > 5) return fail('bad_stars', 'Rating must be 1–5');
      return ok({ ...o, rating: { stars: ev.stars, tags: ev.tags } });
    }
    case 'report_issue': {
      if (o.status !== 'delivered') return fail('not_delivered', 'Report an issue after delivery');
      const b = o.itemCost ?? o.itemsTotal ?? 0;
      return ok({ ...o, issue: ev.issue, refund: { amount: Math.round(b * 0.5) + o.fee.delivery, status: 'requested' } });
    }
    // ---- partner
    case 'seen': {
      if (o.seenIds.includes(ev.partnerId)) return ok(o);
      return ok({ ...o, seenIds: [...o.seenIds, ev.partnerId] });
    }
    case 'accept': {
      if (!open) return fail('taken', 'Request taken by another partner');
      if (o.courierId) return fail('taken', 'Request taken by another partner');
      if (o.mode === 'choose' && o.chosenId !== ev.partnerId) return fail('not_chosen', 'This request was sent to another partner');
      if (o.declinedIds.includes(ev.partnerId)) return fail('declined', 'You declined this request');
      if (o.mode === 'offers') return fail('wrong_mode', 'Send an offer instead; the customer picks one');
      // accepting while your own counter is pending = accept at the base fee
      return ok(assign(o, ev.partnerId, ev.partnerName, now));
    }
    case 'decline': {
      if (!open) return fail('not_open', 'The request is no longer open');
      const declinedIds = o.declinedIds.includes(ev.partnerId) ? o.declinedIds : [...o.declinedIds, ev.partnerId];
      const wasChosen = o.mode === 'choose' && o.chosenId === ev.partnerId;
      const counter = o.counter?.partnerId === ev.partnerId ? null : o.counter;
      const offers = o.offers.filter(x => x.partnerId !== ev.partnerId);
      return ok({ ...(counter ? o : stamp(o, 'requesting', now)), declinedIds, chosenId: wasChosen ? null : o.chosenId, counter, offers });
    }
    case 'counter': {
      if (!open) return fail('not_open', 'The request is no longer open');
      if (o.mode === 'offers') return fail('wrong_mode', 'Send an offer instead');
      if (o.mode === 'choose' && o.chosenId !== ev.partnerId) return fail('not_chosen', 'This request was sent to another partner');
      if (o.counter && o.counter.partnerId !== ev.partnerId) return fail('counter_pending', 'The customer is already answering another request');
      if (!(ev.amount > 0)) return fail('bad_amount', 'Extra must be more than ₹0');
      const counter: Counter = { partnerId: ev.partnerId, partnerName: ev.partnerName, amount: ev.amount, reason: ev.reason, at: now };
      return ok({ ...stamp(o, 'counter', now), counter });
    }
    case 'offer': {
      if (o.mode !== 'offers') return fail('wrong_mode', 'This request does not take offers');
      if (!open) return fail('not_open', 'The request is no longer open');
      if (!(ev.price > 0)) return fail('bad_price', 'Price must be more than ₹0');
      const offer: Offer = { partnerId: ev.partnerId, partnerName: ev.partnerName, price: ev.price, etaMin: ev.etaMin, at: now };
      return ok({ ...o, offers: [...o.offers.filter(x => x.partnerId !== ev.partnerId), offer] });
    }
    case 'reached': {
      const e = requireCourier(o, ev.partnerId); if (e) return fail('not_courier', e);
      if (o.status !== 'to_shop') return fail('bad_state', 'Not heading to the shop');
      return ok(stamp(o, 'shopping', now));
    }
    case 'check_item': {
      const e = requireCourier(o, ev.partnerId); if (e) return fail('not_courier', e);
      if (o.status !== 'shopping') return fail('bad_state', 'Not shopping');
      const it = o.items[ev.index]; if (!it) return fail('bad_item', 'No such item');
      if (ev.substitute && !o.subs) return fail('no_subs', 'The customer did not allow substitutes');
      const items = o.items.map((x, i) => i === ev.index ? { ...x, bought: ev.bought, unavailable: !!ev.unavailable, substitute: ev.substitute ?? null } : x);
      return ok({ ...o, items });
    }
    case 'bought': {
      const e = requireCourier(o, ev.partnerId); if (e) return fail('not_courier', e);
      if (o.status !== 'shopping') return fail('bad_state', 'Not shopping');
      if (o.kind === 'parcel') return ok({ ...stamp(o, 'to_customer', now), itemCost: 0, pickupPhotoUrl: ev.receiptUrl });
      if (o.kind === 'list') {
        if (!(ev.itemCost != null && ev.itemCost > 0)) return fail('bad_cost', 'Enter what you paid for the items');
        return ok({ ...stamp(o, 'to_customer', now), itemCost: ev.itemCost, receiptUrl: ev.receiptUrl });
      }
      // shop order: price is the catalogue total; partner may still attach the shop bill
      return ok({ ...stamp(o, 'to_customer', now), itemCost: o.itemsTotal, receiptUrl: ev.receiptUrl });
    }
    case 'arrived': {
      const e = requireCourier(o, ev.partnerId); if (e) return fail('not_courier', e);
      if (o.status !== 'to_customer') return fail('bad_state', 'Not on the way yet');
      return ok(stamp(o, 'arrived', now));
    }
    case 'complete': {
      const e = requireCourier(o, ev.partnerId); if (e) return fail('not_courier', e);
      if (o.status !== 'arrived') return fail('bad_state', 'Mark arrived first');
      if ((ev.otp || '').trim() !== o.otp) return fail('bad_otp', 'Code does not match. Ask the customer for the 4-digit code');
      if (o.pay === 'cod' && !ev.cashCollected) return fail('cash', 'Confirm the cash collected first');
      return ok({ ...stamp(o, 'delivered', now), cashCollected: o.pay === 'cod' });
    }
    case 'rate_customer': {
      const e = requireCourier(o, ev.partnerId); if (e) return fail('not_courier', e);
      if (o.status !== 'delivered') return fail('not_delivered', 'Rate after delivery');
      return ok({ ...o, customerRating: ev.stars });
    }
    case 'unassign': {
      if (o.courierId !== ev.partnerId) return fail('not_courier', 'Not your job');
      if (o.status !== 'to_shop') return fail('bad_state', 'You can only drop a job before you start shopping');
      // back to requesting; this partner is marked declined so it re-dispatches to others
      return ok({ ...stamp(o, 'requesting', now), courierId: null, courierName: null, declinedIds: [...o.declinedIds, ev.partnerId], cancelReason: ev.reason });
    }
    // ---- system
    case 'assign': {
      if (!open || o.courierId) return fail('taken', 'Already assigned');
      return ok(assign(o, ev.partnerId, ev.partnerName, now, ev.price));
    }
    case 'expand_radius': {
      if (!open) return ok(o);
      const ladder = DISPATCH.radiusKm;
      const i = ladder.indexOf(o.searchRadiusKm);
      const next = ladder[Math.min(ladder.length - 1, i + 1)] ?? ladder[ladder.length - 1];
      return ok({ ...o, searchRadiusKm: next });
    }
    case 'expire': {
      if (!open) return fail('not_open', 'Not open');
      return ok({ ...stamp(o, 'expired', now), cancelledBy: 'system', cancelReason: 'No partner accepted in time' });
    }
    case 'expire_offers': {
      const cutoff = Date.parse(ev.now) - DISPATCH.offerTtlMs;
      const offers = o.offers.filter(x => Date.parse(x.at) >= cutoff);
      return offers.length === o.offers.length ? ok(o) : ok({ ...o, offers });
    }
    case 'chosen_timeout': {
      if (o.mode !== 'choose' || !o.chosenId || !open) return ok(o);
      return ok({ ...stamp(o, 'requesting', now), declinedIds: [...o.declinedIds, o.chosenId], chosenId: null, counter: null });
    }
  }
}

export function canApply(o: Order, ev: OrderEventInput): boolean {
  return apply(o, ev).ok;
}

/** Index of the current step in a stepper; -1 before assignment. */
export function stepIndex(status: OrderStatus, steps: [string, OrderStatus][]): number {
  const order: OrderStatus[] = ['to_shop', 'shopping', 'to_customer', 'arrived', 'delivered'];
  const cur = order.indexOf(status);
  if (cur < 0) return -1;
  let idx = -1;
  steps.forEach(([, s], i) => { if (order.indexOf(s) <= cur) idx = i; });
  return idx;
}
