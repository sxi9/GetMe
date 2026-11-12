// Integration test: boots the API on a random port with a throw-away DB and
// bots off, then drives the three roles through real orders over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let proc: ChildProcess; let base = ''; let dir = '';
const j = async (path: string, opts: { method?: string; body?: unknown; token?: string } = {}) => {
  const r = await fetch(base + path, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}) }, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${data.message ?? ''}`), { code: data.error, status: r.status });
  return data;
};
const login = async (phone: string, role: string) => { await j('/api/auth/otp', { body: { phone, role } }); return j('/api/auth/verify', { body: { phone, role, code: '1234' } }); };
const ev = (id: string, body: unknown, token: string) => j(`/api/orders/${id}/events`, { body, token });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'getme-'));
  proc = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: join(import.meta.dirname, '..'), env: { ...process.env, PORT: '0', DATA_DIR: dir, SIM_BOTS: '0', LOG: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  base = await new Promise<string>((res, rej) => {
    const t = setTimeout(() => rej(new Error('API did not start')), 20000);
    proc.stdout!.on('data', (d) => { const m = /GetMe API on (http:\/\/localhost:\d+)/.exec(String(d)); if (m) { clearTimeout(t); res(m[1]); } });
  });
});
after(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

test('auth: wrong code is rejected, right code signs in, role endpoints are guarded', async () => {
  await j('/api/auth/otp', { body: { phone: '9845012345', role: 'customer' } });
  await assert.rejects(j('/api/auth/verify', { body: { phone: '9845012345', role: 'customer', code: '0000' } }), /wrong or has expired/);
  const c = await login('9845012345', 'customer');
  assert.equal(c.user.name, 'Priya Menon'); assert.equal(c.wallet, 350);
  await assert.rejects(j('/api/partner/requests', { token: c.token }), /for partners/);
  await assert.rejects(j('/api/me'), /Sign in/);
});

test('list order: broadcast → partner accepts → shops → handover with OTP → settlement, chat, tip, rating', async () => {
  const c = await login('9845012345', 'customer'), p = await login('9986044112', 'partner');
  await j('/api/partner/online', { body: { online: true }, token: p.token });
  await j('/api/partner/location', { body: { lat: 12.908, lng: 77.65 }, token: p.token });
  const q = await j('/api/orders/quote', { body: { kind: 'list', items: [{ name: 'Tomato 1 kg', qty: 1 }], mode: 'broadcast', pay: 'upi', promoCode: 'GETME20' }, token: c.token });
  assert.equal(q.promo, 20); assert.equal(q.bill.known, false);
  const o = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Tomato 1 kg', qty: 1 }, { name: 'Milk', qty: 2 }], mode: 'broadcast', pay: 'upi', promoCode: 'GETME20', budget: 300 }, token: c.token });
  assert.equal(o.status, 'requesting'); assert.match(o.otp, /^\d{4}$/);
  const reqs = await j('/api/partner/requests', { token: p.token });
  assert.equal(reqs.length, 1); assert.equal(reqs[0].otp, undefined, 'partner never sees the OTP');
  // partner cannot progress a job they do not hold
  await assert.rejects(ev(o.id, { type: 'reached' }, p.token), /another partner/);
  let v = await ev(o.id, { type: 'accept' }, p.token); assert.equal(v.status, 'to_shop'); assert.equal(v.courierName, 'Ravi Kumar');
  const active = await j('/api/partner/active', { token: p.token }); assert.equal(active.id, o.id);
  await assert.rejects(ev(o.id, { type: 'accept' }, p.token), /Finish your current job|taken/);
  v = await ev(o.id, { type: 'reached' }, p.token); assert.equal(v.status, 'shopping');
  await assert.rejects(ev(o.id, { type: 'cancel' }, c.token), /no longer be cancelled/);
  v = await ev(o.id, { type: 'check_item', index: 0, bought: true }, p.token); assert.equal(v.items[0].bought, true);
  await assert.rejects(ev(o.id, { type: 'bought', itemCost: 500, receiptUrl: null }, p.token), /over the customer/);
  v = await ev(o.id, { type: 'bought', itemCost: 180, receiptUrl: '/uploads/sample-receipt.svg' }, p.token); assert.equal(v.status, 'to_customer');
  // chat both ways
  await j(`/api/orders/${o.id}/messages`, { body: { text: 'Please get red onions' }, token: c.token });
  await j(`/api/orders/${o.id}/messages`, { body: { type: 'photo', text: '/uploads/sample-receipt.svg' }, token: p.token });
  const msgs = await j(`/api/orders/${o.id}/messages`, { token: c.token });
  assert.ok(msgs.some((m: any) => m.text === 'Please get red onions') && msgs.some((m: any) => m.type === 'photo'));
  v = await ev(o.id, { type: 'arrived' }, p.token); assert.equal(v.status, 'arrived');
  await assert.rejects(ev(o.id, { type: 'complete', otp: '0000', cashCollected: false }, p.token), /does not match/);
  const mine = await j(`/api/orders/${o.id}`, { token: c.token });
  v = await ev(o.id, { type: 'complete', otp: mine.otp, cashCollected: false }, p.token); assert.equal(v.status, 'delivered');
  assert.equal(v.bill.total, 180 + 45 + 5 - 20);
  await ev(o.id, { type: 'tip', amount: 20 }, c.token);
  await ev(o.id, { type: 'rate', stars: 5, tags: ['On time'] }, c.token);
  const e = await j('/api/partner/earnings', { token: p.token });
  assert.equal(e.trips, 1); assert.equal(e.tips, 20); assert.equal(e.today, 45 + 20);
  assert.equal(e.balance, 45 + 180 + 20, 'payout + reimbursement + tip');
  const me = await j('/api/me', { token: p.token }); assert.equal(me.partner.activeOrderId, null);
});

test('shop order: stock reserved, shop status beside partner status, COD cash due, wallet needs balance', async () => {
  const c = await login('9845012345', 'customer'), p = await login('9986044112', 'partner'), s = await login('9886071234', 'shop');
  const before = (await j('/api/shop', { token: s.token })).items.find((i: any) => i.id === 'n6').stock;
  await assert.rejects(j('/api/orders', { body: { kind: 'shop', shopId: 'nandini', items: [{ itemId: 'n6', qty: 99 }], mode: 'broadcast', pay: 'cod' }, token: c.token }), /Only/);
  await assert.rejects(j('/api/orders', { body: { kind: 'shop', shopId: 'krishna', items: [{ itemId: 'k1', qty: 1 }], mode: 'broadcast', pay: 'cod' }, token: c.token }), /closed/);
  const o = await j('/api/orders', { body: { kind: 'shop', shopId: 'nandini', items: [{ itemId: 'n1', qty: 2 }, { itemId: 'n6', qty: 1 }], mode: 'broadcast', pay: 'cod' }, token: c.token });
  assert.equal(o.itemsTotal, 128); assert.equal(o.bill.total, 128 + 35 + 5);
  assert.equal((await j('/api/shop', { token: s.token })).items.find((i: any) => i.id === 'n6').stock, before - 1);
  let so = (await j('/api/shop/orders', { token: s.token })).find((x: any) => x.id === o.id);
  assert.equal(so.shopStatus, 'new'); assert.equal(so.otp, undefined); assert.equal(so.address, undefined);
  await j(`/api/shop/orders/${o.id}/advance`, { body: {}, token: s.token });
  await j(`/api/shop/orders/${o.id}/advance`, { body: {}, token: s.token });
  await assert.rejects(j(`/api/shop/orders/${o.id}/advance`, { body: {}, token: s.token }), /No partner/);
  await ev(o.id, { type: 'accept' }, p.token);
  await j(`/api/shop/orders/${o.id}/advance`, { body: {}, token: s.token });
  so = (await j('/api/shop/orders', { token: s.token })).find((x: any) => x.id === o.id); assert.equal(so.shopStatus, 'handed');
  await ev(o.id, { type: 'reached' }, p.token);
  let v = await ev(o.id, { type: 'bought', itemCost: null, receiptUrl: null }, p.token); assert.equal(v.itemCost, 128);
  await ev(o.id, { type: 'arrived' }, p.token);
  const mine = await j(`/api/orders/${o.id}`, { token: c.token });
  await assert.rejects(ev(o.id, { type: 'complete', otp: mine.otp, cashCollected: false }, p.token), /cash/);
  v = await ev(o.id, { type: 'complete', otp: mine.otp, cashCollected: true }, p.token); assert.equal(v.status, 'delivered');
  const e = await j('/api/partner/earnings', { token: p.token });
  assert.equal(e.codDue, 128 + 35 + 5 - 35, 'partner owes the platform cash minus their delivery fee');
  const an = await j('/api/shop/analytics', { token: s.token });
  assert.equal(an.settlement, Math.round(128 * 0.92));
  // wallet guard
  await assert.rejects(j('/api/orders', { body: { kind: 'parcel', address: { line: 'Koramangala' }, receiver: { name: 'A', phone: '9900011122' }, pkSize: 'Large', mode: 'broadcast', pay: 'wallet' }, token: (await login('9000000001', 'customer')).token }), /Wallet balance|address/);
});

test('offers, choose + counter, cancel, decline, unassign', async () => {
  const c = await login('9845012345', 'customer'), p = await login('9986044112', 'partner');
  const o = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Bread', qty: 1 }], mode: 'offers', pay: 'upi' }, token: c.token });
  await assert.rejects(ev(o.id, { type: 'accept' }, p.token), /offer/);
  let v = await ev(o.id, { type: 'offer', price: 55, etaMin: 12 }, p.token); assert.equal(v.myOffer.price, 55);
  v = await ev(o.id, { type: 'accept_offer', partnerId: v.myOffer.partnerId }, c.token); assert.equal(v.status, 'to_shop'); assert.equal(v.fee.delivery, 55);
  v = await ev(o.id, { type: 'unassign', reason: 'Puncture' }, p.token); assert.equal(v.status, 'requesting'); assert.equal(v.courierId, null);
  v = await ev(o.id, { type: 'cancel' }, c.token); assert.equal(v.status, 'cancelled');

  const o2 = await j('/api/orders', { body: { kind: 'parcel', address: { line: 'Koramangala 4th Block' }, receiver: { name: 'Amma', phone: '9900011122' }, pkType: 'Keys', pkSize: 'Small', insure: true, mode: 'choose', pay: 'upi' }, token: c.token });
  const cands = await j(`/api/orders/${o2.id}/partners`, { token: c.token });
  const ravi = cands.find((x: any) => x.name === 'Ravi Kumar'); assert.ok(ravi);
  await ev(o2.id, { type: 'choose_partner', partnerId: ravi.id }, c.token);
  assert.equal((await j('/api/partner/requests', { token: p.token })).length, 1);
  v = await ev(o2.id, { type: 'counter', amount: 30, reason: 'Rain' }, p.token); assert.equal(v.status, 'counter');
  v = await ev(o2.id, { type: 'decline_counter' }, c.token); assert.equal(v.status, 'requesting');
  v = await ev(o2.id, { type: 'counter', amount: 20, reason: 'Far pickup' }, p.token);
  v = await ev(o2.id, { type: 'approve_counter' }, c.token); assert.equal(v.status, 'to_shop'); assert.equal(v.fee.extra, 20); assert.equal(v.bill.total, 49 + 5 + 9 + 20);
  await ev(o2.id, { type: 'cancel' }, c.token);
  const o3 = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Eggs', qty: 1 }], mode: 'choose', pay: 'upi' }, token: c.token });
  await ev(o3.id, { type: 'choose_partner', partnerId: ravi.id }, c.token);
  v = await ev(o3.id, { type: 'decline' }, p.token); assert.deepEqual(v.declinedIds, [ravi.id]); assert.equal(v.chosenId, null);
  await assert.rejects(ev(o3.id, { type: 'choose_partner', partnerId: ravi.id }, c.token), /already declined/);
  await ev(o3.id, { type: 'cancel' }, c.token);
});

test('subscriptions, wallet top-up, addresses, share link, notifications', async () => {
  const c = await login('9845012345', 'customer');
  const o = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Curd', qty: 1 }], mode: 'broadcast', pay: 'wallet', repeat: true }, token: c.token });
  const subs = await j('/api/subscriptions', { token: c.token }); assert.equal(subs.length, 1);
  await j(`/api/subscriptions/${subs[0].id}/stop`, { body: {}, token: c.token });
  assert.equal((await j('/api/subscriptions', { token: c.token })).length, 0);
  const share = await j(`/api/orders/${o.id}/share`, { body: {}, token: c.token });
  const pub = await j(`/api/track/${share.token}`); assert.equal(pub.id, o.id); assert.equal(pub.otp, undefined);
  await ev(o.id, { type: 'cancel' }, c.token);
  const w = await j('/api/wallet/topup', { body: { amount: 500 }, token: c.token }); assert.equal(w.balance, 850);
  const addrs = await j('/api/addresses', { body: { label: 'Gym', line: 'Cult, 27th Main' }, token: c.token }); assert.equal(addrs.length, 3);
  const n = await j('/api/notifications', { token: c.token }); assert.ok(n.length > 0);
});
