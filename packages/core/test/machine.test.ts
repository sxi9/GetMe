import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, bill, settle, makeFee, deliveryFeeForKm, eligiblePartners, dispatchTick, DISPATCH, promoFor, regionFor, REGIONS, joinableRuns } from '../src/index.js';
import type { Run } from '../src/index.js';
import type { Order, Partner } from '../src/index.js';

const now = '2026-11-12T09:00:00.000Z';
const base = (over: Partial<Order> = {}): Order => ({
  id: 'GM-1', kind: 'list', customerId: 'u1', customerName: 'Priya', anon: false, shopId: null, shopName: 'Any nearby shop', shopPos: null,
  items: [{ name: 'Tomato 1 kg', qty: 1, unit: '', price: null }], itemsTotal: null,
  address: { label: 'Home', line: '12, 27th Main', lat: 12.91, lng: 77.64 }, pickup: null, mode: 'broadcast', runId: null, regionId: 'blr-city', dispatch: { radiusKm: [2, 4, 6], expandEveryMs: 60_000, expireAfterMs: 5 * 60_000 }, pay: 'upi', promoCode: null, promo: 0,
  when: 'now', slot: null, scheduledAt: null, budget: null, subs: true, repeat: false, note: '', receiver: null, pkType: null, pkSize: null,
  status: 'requesting', courierId: null, courierName: null, chosenId: null, offers: [], counter: null, declinedIds: [], seenIds: [],
  fee: makeFee(45), itemCost: null, receiptUrl: null, pickupPhotoUrl: null, otp: '4821', cashCollected: false, podPhotoUrl: null, crypto: null, idempotencyKeys: [], tip: 0, rating: null, customerRating: null,
  issue: null, refund: null, cancelReason: null, cancelledBy: null, times: { requesting: now }, searchRadiusKm: 2, createdAt: now, updatedAt: now, ...over,
});
const ok = (r: ReturnType<typeof apply>): Order => { assert.equal(r.ok, true, r.ok ? '' : r.message); return (r as any).order; };

test('broadcast: accept → reached → bought → arrived → complete', () => {
  let o = base();
  o = ok(apply(o, { type: 'accept', actor: 'partner', partnerId: 'p1', partnerName: 'Ravi' }, now));
  assert.equal(o.status, 'to_shop'); assert.equal(o.courierId, 'p1');
  assert.equal(apply(o, { type: 'accept', actor: 'partner', partnerId: 'p2', partnerName: 'X' }).ok, false, 'second accept rejected');
  assert.equal(apply(o, { type: 'reached', actor: 'partner', partnerId: 'p2' }).ok, false, 'other partner cannot progress');
  o = ok(apply(o, { type: 'reached', actor: 'partner', partnerId: 'p1' }, now));
  assert.equal(apply(o, { type: 'bought', actor: 'partner', partnerId: 'p1', itemCost: 0, receiptUrl: null }).ok, false, 'cost required');
  o = ok(apply(o, { type: 'bought', actor: 'partner', partnerId: 'p1', itemCost: 180, receiptUrl: 'r.jpg' }, now));
  assert.equal(o.status, 'to_customer'); assert.equal(o.itemCost, 180);
  o = ok(apply(o, { type: 'arrived', actor: 'partner', partnerId: 'p1' }, now));
  assert.equal(apply(o, { type: 'complete', actor: 'partner', partnerId: 'p1', otp: '0000', cashCollected: false }).ok, false, 'wrong otp');
  o = ok(apply(o, { type: 'complete', actor: 'partner', partnerId: 'p1', otp: '4821', cashCollected: false }, now));
  assert.equal(o.status, 'delivered');
  const b = bill(o); assert.equal(b.total, 180 + 45 + 5);
  const s = settle(o); assert.equal(s.customerCharge, 230); assert.equal(s.partnerEarned, 45); assert.equal(s.partnerLedgerDelta, 45 + 180);
});

test('COD settlement: partner holds cash and owes platform the service fee', () => {
  let o = base({ pay: 'cod', status: 'delivered', courierId: 'p1', itemCost: 100, tip: 10 });
  const s = settle(o);
  assert.equal(s.cashCollected, 100 + 45 + 5 + 10);
  assert.equal(s.partnerEarned, 55);
  assert.equal(s.partnerLedgerDelta, -5);
});

test('cancel allowed only before shopping', () => {
  let o = base();
  assert.equal(apply(o, { type: 'cancel', actor: 'customer' }).ok, true);
  o = ok(apply(o, { type: 'accept', actor: 'partner', partnerId: 'p1', partnerName: 'Ravi' }, now));
  assert.equal(apply(o, { type: 'cancel', actor: 'customer' }).ok, true);
  o = ok(apply(o, { type: 'reached', actor: 'partner', partnerId: 'p1' }, now));
  assert.equal(apply(o, { type: 'cancel', actor: 'customer' }).ok, false);
});

test('counter offer: decline keeps request open; partner can accept at base fee; approve sets extra', () => {
  let o = base();
  o = ok(apply(o, { type: 'counter', actor: 'partner', partnerId: 'p1', partnerName: 'Ravi', amount: 30, reason: 'Rain' }, now));
  assert.equal(o.status, 'counter');
  const declined = ok(apply(o, { type: 'decline_counter', actor: 'customer' }, now));
  assert.equal(declined.status, 'requesting'); assert.equal(declined.counter, null);
  const acc = ok(apply(declined, { type: 'accept', actor: 'partner', partnerId: 'p1', partnerName: 'Ravi' }, now));
  assert.equal(acc.fee.extra, 0);
  const approved = ok(apply(o, { type: 'approve_counter', actor: 'customer' }, now));
  assert.equal(approved.status, 'to_shop'); assert.equal(approved.fee.extra, 30); assert.equal(approved.courierId, 'p1');
});

test('offers mode: offers collect; accept_offer sets delivery fee; plain accept rejected', () => {
  let o = base({ mode: 'offers' });
  assert.equal(apply(o, { type: 'accept', actor: 'partner', partnerId: 'p1', partnerName: 'R' }).ok, false);
  o = ok(apply(o, { type: 'offer', actor: 'partner', partnerId: 'p1', partnerName: 'R', price: 60, etaMin: 9 }, now));
  o = ok(apply(o, { type: 'offer', actor: 'partner', partnerId: 'p2', partnerName: 'F', price: 45, etaMin: 14 }, now));
  o = ok(apply(o, { type: 'offer', actor: 'partner', partnerId: 'p1', partnerName: 'R', price: 50, etaMin: 9 }, now));
  assert.equal(o.offers.length, 2, 'one offer per partner');
  o = ok(apply(o, { type: 'accept_offer', actor: 'customer', partnerId: 'p2' }, now));
  assert.equal(o.fee.delivery, 45); assert.equal(o.courierId, 'p2'); assert.equal(o.offers.length, 0);
});

test('choose mode: only the chosen partner may accept; decline returns to choosing', () => {
  let o = base({ mode: 'choose' });
  o = ok(apply(o, { type: 'choose_partner', actor: 'customer', partnerId: 'p2' }, now));
  assert.equal(apply(o, { type: 'accept', actor: 'partner', partnerId: 'p1', partnerName: 'R' }).ok, false);
  const d = ok(apply(o, { type: 'decline', actor: 'partner', partnerId: 'p2' }, now));
  assert.deepEqual(d.declinedIds, ['p2']); assert.equal(d.chosenId, null);
  assert.equal(apply(d, { type: 'choose_partner', actor: 'customer', partnerId: 'p2' }).ok, false, 'cannot re-choose a decliner');
  const t = ok(apply(o, { type: 'chosen_timeout', actor: 'system' }, now));
  assert.deepEqual(t.declinedIds, ['p2']);
});

test('parcel: bought needs no cost; shop order uses catalogue total', () => {
  let p = base({ kind: 'parcel', status: 'shopping', courierId: 'p1', fee: makeFee(49, 1) });
  p = ok(apply(p, { type: 'bought', actor: 'partner', partnerId: 'p1', itemCost: null, receiptUrl: 'pic.jpg' }, now));
  assert.equal(p.status, 'to_customer'); assert.equal(bill(p).total, 49 + 5 + 9);
  let s = base({ kind: 'shop', status: 'shopping', courierId: 'p1', itemsTotal: 120, items: [{ name: 'Rice', qty: 1, unit: '1 kg', price: 120 }] });
  s = ok(apply(s, { type: 'bought', actor: 'partner', partnerId: 'p1', itemCost: null, receiptUrl: null }, now));
  assert.equal(s.itemCost, 120);
  const st = settle({ ...s, shopId: 'sh1' });
  assert.equal(st.shopPayout, Math.round(120 * 0.92)); assert.equal(st.partnerLedgerDelta, 45, 'partner does not front shop items');
});

test('substitutes respect the customer toggle', () => {
  const o = base({ status: 'shopping', courierId: 'p1', subs: false });
  assert.equal(apply(o, { type: 'check_item', actor: 'partner', partnerId: 'p1', index: 0, bought: true, substitute: 'Cherry tomato' }).ok, false);
  assert.equal(apply({ ...o, subs: true }, { type: 'check_item', actor: 'partner', partnerId: 'p1', index: 0, bought: true, substitute: 'Cherry tomato' }).ok, true);
});

test('pricing: fee ladder matches the handoff shop fees; promo caps at delivery', () => {
  assert.equal(deliveryFeeForKm(0.6), 35); assert.equal(deliveryFeeForKm(0.9), 40); assert.equal(deliveryFeeForKm(1.1), 45); assert.equal(deliveryFeeForKm(1.4), 50);
  assert.equal(promoFor('getme20', 'list', 45).discount, 20);
  assert.equal(promoFor('GETME20', 'parcel', 49).discount, 0);
  assert.equal(promoFor('NOPE', 'list', 45).reason, 'Code not valid');
});

test('dispatch: eligibility by radius, online, free, freshness; ticks expand and expire', () => {
  const o = base({ shopPos: { lat: 12.91, lng: 77.64 } });
  const p = (id: string, over: Partial<Partner> = {}): Partner => ({ id, userId: id, name: id, initials: 'X', photoUrl: null, tier: 'pro', documents: [], verification: 'verified', verificationNote: null, communityId: null, activeRunId: null, vehicle: 'Bike', plate: '', rating: 4.5, trips: 1, online: true, pos: { lat: 12.915, lng: 77.64 }, posAt: now, area: '', verified: true, activeOrderId: null, floatLimit: 2000, ...over });
  const t = Date.parse(now) + 1000;
  const ids = (ps: Partner[]) => eligiblePartners(o, ps, t).map(x => x.id);
  assert.deepEqual(ids([p('a'), p('b', { online: false }), p('c', { activeOrderId: 'x' }), p('d', { pos: { lat: 13.0, lng: 77.64 } }), p('e', { posAt: '2020-01-01T00:00:00Z' })]), ['a']);
  assert.deepEqual(ids([p('a')]).length, 1);
  assert.equal(dispatchTick(o, Date.parse(now) + 1000), 'none');
  assert.equal(dispatchTick(o, Date.parse(now) + DISPATCH.expandEveryMs + 1), 'expand');
  assert.equal(dispatchTick(o, Date.parse(now) + DISPATCH.expireAfterMs), 'expire');
  const c = base({ mode: 'choose', chosenId: 'a', updatedAt: now });
  assert.equal(dispatchTick(c, Date.parse(now) + DISPATCH.chooseRespondMs), 'chosen_timeout');
});

test('handoff: leave_at_door needs a photo instead of the code; gate too', () => {
  const o = base({ status: 'arrived', courierId: 'p1', address: { label: 'Home', line: 'x', lat: 1, lng: 1, handoff: 'leave_at_door' } });
  assert.equal(apply(o, { type: 'complete', actor: 'partner', partnerId: 'p1', otp: '', cashCollected: false }).ok, false);
  const r = apply(o, { type: 'complete', actor: 'partner', partnerId: 'p1', otp: '', cashCollected: false, podPhotoUrl: '/uploads/door.jpg' }, now);
  assert.equal(r.ok, true); assert.equal((r as any).order.podPhotoUrl, '/uploads/door.jpg');
});

test('runs: attach → scheduled → start_run → to_shop; detach returns to broadcast', () => {
  let o = base({ mode: 'run' });
  assert.equal(apply(o, { type: 'accept', actor: 'partner', partnerId: 'p1', partnerName: 'R' }).ok, false, 'run orders are not broadcast');
  o = ok(apply(o, { type: 'attach_run', actor: 'system', partnerId: 'p1', partnerName: 'Ravi', runId: 'run_1', price: 60 }, now));
  assert.equal(o.status, 'scheduled'); assert.equal(o.fee.delivery, 60); assert.equal(o.courierId, 'p1');
  assert.equal(apply(o, { type: 'cancel', actor: 'customer' }).ok, true, 'cancellable while waiting');
  assert.equal(apply(o, { type: 'start_run', actor: 'partner', partnerId: 'p2' }).ok, false);
  const started = ok(apply(o, { type: 'start_run', actor: 'partner', partnerId: 'p1' }, now));
  assert.equal(started.status, 'to_shop');
  const d = ok(apply(o, { type: 'detach_run', actor: 'system', reason: 'Run cancelled' }, now));
  assert.equal(d.status, 'requesting'); assert.equal(d.mode, 'broadcast'); assert.equal(d.courierId, null);
});

test('regions: city inside coverage, hill profile near Madikeri, village elsewhere; fee uses the profile', () => {
  assert.equal(regionFor({ lat: 12.9121, lng: 77.6446 }).id, 'blr-city');
  assert.equal(regionFor({ lat: 12.43, lng: 75.74 }).id, 'hill');
  assert.equal(regionFor({ lat: 15.3, lng: 76.4 }).id, 'village');
  const hill = REGIONS.find(r => r.id === 'hill')!;
  assert.equal(deliveryFeeForKm(10, 1, hill), 225); // (40 + 140) × 1.25 = 225
  assert.equal(deliveryFeeForKm(0.6, 1), 35, 'default profile unchanged');
});

test('joinable runs: open, before cutoff, with capacity, community-scoped, within range', () => {
  const run = (over: Partial<Run>): Run => ({ id: 'r', partnerId: 'p', partnerName: 'P', label: 'Market', destination: 'Town', destinationPos: null, from: { label: 'x', line: 'x', lat: 12.91, lng: 77.64 }, departAt: '2026-11-12T10:00:00Z', cutoffAt: '2026-11-12T09:30:00Z', capacity: 5, feePerOrder: 60, communityId: null, status: 'open', orderIds: [], note: '', createdAt: now, updatedAt: now, ...over });
  const t = Date.parse('2026-11-12T09:00:00Z');
  const pos = { lat: 12.912, lng: 77.645 };
  const ids = (rs: Run[], c: string | null = null) => joinableRuns(rs, pos, c, t).map(r => r.id);
  assert.deepEqual(ids([run({ id: 'a' }), run({ id: 'b', status: 'closed' }), run({ id: 'c', cutoffAt: '2026-11-12T08:00:00Z' }), run({ id: 'd', orderIds: ['1', '2', '3', '4', '5'] }), run({ id: 'e', communityId: 'soc1' }), run({ id: 'f', from: { label: 'x', line: 'x', lat: 14, lng: 77 } })]), ['a']);
  assert.deepEqual(ids([run({ id: 'e', communityId: 'soc1' })], 'soc1'), ['e']);
});

test('crypto: handover waits for the invoice to be paid; settlement is like a card charge', () => {
  const inv = { provider: 'sim' as const, invoiceId: 'i1', purpose: 'order' as const, currency: 'USDT' as const, network: 'TRC20', amountInr: 230, amountCrypto: 2.73, rateInr: 84.5, address: 'T…', payUrl: null, status: 'pending' as const, txHash: null, createdAt: now, expiresAt: now, paidAt: null };
  const o = base({ pay: 'crypto', status: 'arrived', courierId: 'p1', itemCost: 180, crypto: inv });
  const r = apply(o, { type: 'complete', actor: 'partner', partnerId: 'p1', otp: '4821', cashCollected: false });
  assert.equal(r.ok, false); assert.equal((r as any).code, 'crypto_unpaid');
  const paid = ok(apply({ ...o, crypto: { ...inv, status: 'paid' } }, { type: 'complete', actor: 'partner', partnerId: 'p1', otp: '4821', cashCollected: false }, now));
  assert.equal(paid.status, 'delivered');
  const s = settle(paid); assert.equal(s.customerCharge, 230); assert.equal(s.cashCollected, 0); assert.equal(s.partnerLedgerDelta, 45 + 180);
});
