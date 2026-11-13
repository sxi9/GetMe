// Security regression tests: auth hardening, authorisation boundaries, input
// bounds, upload and header hardening. Boots its own API like api.test.ts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let proc: ChildProcess; let base = ''; let dir = ''; let priya: any;
const raw = async (path: string, opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) => fetch(base + path, { method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: 'Bearer ' + opts.token } : {}), ...(opts.headers ?? {}) }, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
const j = async (path: string, opts: Parameters<typeof raw>[1] = {}) => { const r = await raw(path, opts); const data: any = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${data.message ?? ''}`), { code: data.error, status: r.status }); return data; };
const login = async (phone: string, role: string) => { await j('/api/auth/otp', { body: { phone, role } }); return j('/api/auth/verify', { body: { phone, role, code: '1234' } }); };
const ev = (id: string, body: unknown, token: string) => j(`/api/orders/${id}/events`, { body, token });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'getme-sec-'));
  proc = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: join(import.meta.dirname, '..'), env: { ...process.env, PORT: '0', DATA_DIR: dir, SIM_BOTS: '0', LOG: '0', OTP_PER_PHONE: '5' }, stdio: ['ignore', 'pipe', 'inherit'] });
  base = await new Promise<string>((res, rej) => { const t = setTimeout(() => rej(new Error('API did not start')), 20000); proc.stdout!.on('data', d => { const m = /GetMe API on (http:\/\/localhost:\d+)/.exec(String(d)); if (m) { clearTimeout(t); res(m[1]); } }); });
  priya = await login('9845012345', 'customer'); // one session reused below: the per-phone code limit is 5 in this process
});
after(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

test('OTP: five wrong codes lock the code; request rate limit per number', async () => {
  const phone = '9111111111';
  await j('/api/auth/otp', { body: { phone, role: 'customer' } });
  for (let i = 0; i < 5; i++) await assert.rejects(j('/api/auth/verify', { body: { phone, role: 'customer', code: '0000' } }), /wrong or has expired/);
  await assert.rejects(j('/api/auth/verify', { body: { phone, role: 'customer', code: '1234' } }), /wrong or has expired|Request a new one/, 'the right code no longer works after 5 misses');
  for (let i = 0; i < 4; i++) await j('/api/auth/otp', { body: { phone, role: 'customer' } });
  const r = await raw('/api/auth/otp', { body: { phone, role: 'customer' } });
  assert.equal(r.status, 429, '6th code request in 15 minutes is rate limited');
});

test('sessions: logout invalidates the token; logout-all clears every device', async () => {
  const a = await login('9000000005', 'customer'); const b = await login('9000000005', 'customer');
  await j('/api/me', { token: a.token });
  await j('/api/auth/logout', { body: {}, token: a.token });
  await assert.rejects(j('/api/me', { token: a.token }), /Sign in/);
  await j('/api/me', { token: b.token });
  await j('/api/auth/logout-all', { body: {}, token: b.token });
  await assert.rejects(j('/api/me', { token: b.token }), /Sign in/);
});

test('authorisation: customers cannot read or act on other customers\' orders; shops cannot touch other shops\' orders; admin sign-up is blocked', async () => {
  const other = await login('9000000003', 'customer');
  const o = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Milk', qty: 1 }], mode: 'broadcast', pay: 'cod' }, token: priya.token });
  await assert.rejects(j(`/api/orders/${o.id}`, { token: other.token }), /Not your order/);
  await assert.rejects(ev(o.id, { type: 'cancel' }, other.token), /Not your order/);
  await assert.rejects(j(`/api/orders/${o.id}/messages`, { token: other.token }), /No chat/);
  await assert.rejects(j(`/api/orders/${o.id}/share`, { body: {}, token: other.token }), /not found/i);
  const shop2 = await login('9000000004', 'shop');
  const so = await j('/api/orders', { body: { kind: 'shop', shopId: 'nandini', items: [{ itemId: 'n1', qty: 1 }], mode: 'broadcast', pay: 'cod' }, token: priya.token });
  await assert.rejects(j(`/api/shop/orders/${so.id}/advance`, { body: {}, token: shop2.token }), /not found/i);
  await assert.rejects(j(`/api/shop/orders/${so.id}/reject`, { body: {}, token: shop2.token }), /Not your order/);
  await assert.rejects(login('9000000099', 'admin'), /created by GetMe ops/);
  await assert.rejects(j('/api/admin/overview', { token: priya.token }), /for admins/);
  await ev(o.id, { type: 'cancel' }, priya.token); await ev(so.id, { type: 'cancel' }, priya.token);
});

test('idempotency keys are scoped per user', async () => {
  const a = priya, b = await login('9000000003', 'customer');
  const key = 'shared-key-' + Date.now();
  const addr = { line: '5, Temple street', lat: 12.913, lng: 77.645 };
  const oa = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Rice', qty: 1 }], mode: 'broadcast', pay: 'cod' }, token: a.token, headers: { 'idempotency-key': key } });
  const ob = await j('/api/orders', { body: { kind: 'list', items: [{ name: 'Rice', qty: 1 }], mode: 'broadcast', pay: 'cod', address: addr }, token: b.token, headers: { 'idempotency-key': key } });
  assert.notEqual(oa.id, ob.id, 'the second user does not receive the first user\'s order');
  assert.equal(ob.customerId, b.user.id);
  await ev(oa.id, { type: 'cancel' }, a.token); await ev(ob.id, { type: 'cancel' }, b.token);
});

test('input bounds: unknown enums fall back, quantities and amounts are clamped, long text is cut', async () => {
  const c = priya;
  const o = await j('/api/orders', { body: { kind: 'weird', items: [{ name: 'x'.repeat(500), qty: 99999 }], mode: 'hack', pay: 'free', note: 'n'.repeat(5000), budget: 1e12 }, token: c.token });
  assert.equal(o.kind, 'list'); assert.equal(o.mode, 'broadcast'); assert.equal(o.pay, 'cod');
  assert.equal(o.items[0].qty, 50); assert.equal(o.items[0].name.length, 80); assert.equal(o.note.length, 500); assert.equal(o.budget, 100000);
  const p = await login('9986044112', 'partner');
  await j('/api/partner/online', { body: { online: true }, token: p.token });
  await assert.rejects(j('/api/partner/location', { body: { lat: 999, lng: 'x' }, token: p.token }), /lat\/lng/);
  await j('/api/partner/location', { body: { lat: 12.908, lng: 77.65 }, token: p.token });
  await ev(o.id, { type: 'accept' }, p.token);
  const m = await j(`/api/orders/${o.id}/messages`, { body: { text: 'm'.repeat(3000), type: 'nope' }, token: c.token });
  assert.equal(m.text.length, 1000); assert.equal(m.type, 'text');
  const photo = await j(`/api/orders/${o.id}/messages`, { body: { text: 'https://evil.example/x.png', type: 'photo' }, token: c.token }).catch(e => e);
  assert.ok(photo instanceof Error, 'photo messages must point at our own uploads');
  await ev(o.id, { type: 'cancel' }, c.token);
});

test('uploads: SVG and non-image payloads are rejected; served files carry hardening headers', async () => {
  const c = priya;
  await assert.rejects(j('/api/uploads', { body: { dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"/>').toString('base64') }, token: c.token }), /JPG, PNG or WebP/);
  await assert.rejects(j('/api/uploads', { body: { dataUrl: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script> not a png at all').toString('base64') }, token: c.token }), /not an image/);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const up = await j('/api/uploads', { body: { dataUrl: 'data:image/png;base64,' + png }, token: c.token });
  assert.match(up.url, /^\/uploads\/img_[a-f0-9]+\.png$/);
  const r = await raw(up.url);
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.match(r.headers.get('content-security-policy') ?? '', /sandbox/);
  const api = await raw('/api/health'); assert.equal(api.headers.get('x-frame-options'), 'DENY');
});

test('push subscriptions only accept real push services; admin region overrides are validated', async () => {
  const c = priya;
  await assert.rejects(j('/api/push/subscribe', { body: { endpoint: 'https://attacker.example/collect', keys: { p256dh: 'x', auth: 'y' } }, token: c.token }), /Bad subscription/);
  await j('/api/push/subscribe', { body: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'x', auth: 'y' } }, token: c.token });
  const a = await login('9000000000', 'admin');
  const regions = await j('/api/admin/regions', { method: 'PUT', body: [{ id: 'hill', surcharge: 99, deliveryBase: -5, defaultPay: 'bitcoin', radiusKm: ['a', 2, 500], evil: true }, { id: 'nope', surcharge: 2 }], token: a.token });
  const hill = regions.find((r: any) => r.id === 'hill');
  assert.equal(hill.surcharge, 5); assert.equal(hill.deliveryBase, 0); assert.equal(hill.defaultPay, 'cod'); assert.deepEqual(hill.radiusKm, [2, 100]); assert.equal(hill.evil, undefined);
  assert.ok(!regions.some((r: any) => r.id === 'nope'));
});
