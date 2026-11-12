import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fstatic from '@fastify/static';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DomainError, TERMINAL, digits, validOtp, validPhone, validEmail, validPassword, validateShopItem, type OrderEventInput, type Partner, type Role, type User } from '@getme/core';
import { Db } from './db.js';
import { Bus } from './bus.js';
import { Service } from './service.js';
import { Sim } from './sim.js';
import { Push, Sms } from './push.js';
import { Crypto } from './crypto.js';
import { Fcm } from './fcm.js';
import { reverse as geoReverse, search as geoSearch } from './geo.js';
import { seed } from './seed.js';
import { now, otp4, token, uid } from './ids.js';

const PORT = Number(process.env.PORT ?? 4000);
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'getme.db');
const DEV_OTP = process.env.DEV_OTP ?? '1234';           // fixed code outside production; set DEV_OTP= to disable
const SIM_BOTS = (process.env.SIM_BOTS ?? '1') !== '0';
const SIM_SPEED = Number(process.env.SIM_SPEED ?? 1);
const UPLOADS = join(DATA_DIR, 'uploads');
mkdirSync(UPLOADS, { recursive: true });
for (const [name, svg] of [['sample-receipt.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#fff" stroke="#ccc"/><text x="16" y="40" font-family="monospace" font-size="14">NANDINI FRESH MART</text><text x="16" y="70" font-family="monospace" font-size="12">Tomato 1kg ....... 40.00</text><text x="16" y="90" font-family="monospace" font-size="12">Onion 1kg ........ 35.00</text><text x="16" y="130" font-family="monospace" font-size="14">TOTAL ........... 75.00</text></svg>'], ['sample-pickup.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#e8edf1"/><rect x="110" y="60" width="100" height="80" rx="6" fill="#c9a66b"/><text x="120" y="170" font-family="sans-serif" font-size="12" fill="#555">Package photo</text></svg>']]) {
  if (!existsSync(join(UPLOADS, name))) writeFileSync(join(UPLOADS, name), svg);
}

const db = new Db(DB_PATH);
seed(db);
const bus = new Bus();
const svc = new Service(db, bus);
svc.push = new Push(db);
svc.sms = new Sms(db);
svc.crypto = new Crypto(db);
svc.fcm = new Fcm(db);
const sim = SIM_BOTS ? new Sim(svc, SIM_SPEED) : null;

// Sim hooks: wrap commit/create so bots react to real events.
if (sim) {
  const origCreate = svc.createOrder.bind(svc);
  svc.createOrder = (ctx, input) => { const o = origCreate(ctx, input); if (o.status === 'requesting' && (o.when !== 'schedule')) sim.onOpen(o); return o; };
  const origCommit = svc.commit.bind(svc);
  svc.commit = (prev, next, ev) => {
    const o = origCommit(prev, next, ev);
    const wasOpen = prev.status === 'requesting' || prev.status === 'counter';
    if (wasOpen && o.courierId && !prev.courierId) sim.onAssigned(o);
    else if (TERMINAL.has(o.status)) sim.onClosed(o);
    else if (ev.type === 'decline_counter' && prev.counter) sim.onCounterDeclined(o, prev.counter.partnerId);
    else if ((ev.type === 'choose_partner' || ev.type === 'unassign' || ev.type === 'expand_radius' || ev.type === 'chosen_timeout') && o.status === 'requesting') sim.onOpen(o);
    return o;
  };
  const origPush = svc.pushMessage.bind(svc);
  svc.pushMessage = (o, from, type, text, pos) => { const m = origPush(o, from, type, text, pos); sim.onMessage(o, from); return m; };
  const origAnnounce = svc.announce.bind(svc);
  svc.announce = (o) => { origAnnounce(o); if (o.when === 'schedule') sim.onOpen(o); };
}

const app = Fastify({ logger: process.env.LOG !== '0' && { level: 'warn' } });
await app.register(cors, { origin: true });
await app.register(websocket);
await app.register(fstatic, { root: UPLOADS, prefix: '/uploads/' });
// Tolerate empty JSON bodies (POST with no payload).
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => { try { done(null, body ? JSON.parse(body as string) : {}); } catch (e) { done(e as Error, undefined); } });

// ---------- auth
function auth(req: FastifyRequest): User {
  const h = req.headers.authorization ?? '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : (req.query as any)?.token;
  const s = tok ? db.getSession(tok) : null;
  const u = s ? db.getUser(s.userId) : null;
  if (!u) throw new DomainError('unauthorized', 'Sign in first');
  return u;
}
const ctxOf = (req: FastifyRequest) => svc.ctx(auth(req));
function requireRole(req: FastifyRequest, role: Role) { const c = ctxOf(req); if (c.user.role !== role) throw new DomainError('forbidden', `This endpoint is for ${role}s`); return c; }

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof DomainError) { const status = err.code === 'unauthorized' ? 401 : err.code === 'forbidden' ? 403 : err.code === 'not_found' ? 404 : 409; return reply.status(status).send({ error: err.code, message: err.message }); }
  if ((err as any).validation) return reply.status(400).send({ error: 'bad_request', message: err.message });
  if ((err as any).statusCode && (err as any).statusCode < 500) return reply.status((err as any).statusCode).send({ error: (err as any).code ?? 'bad_request', message: err.message });
  app.log.error(err);
  return reply.status(500).send({ error: 'internal', message: 'Something went wrong' });
});

const ROLES: Role[] = ['customer', 'partner', 'shop', 'admin'];
function newUser(role: Role, name: string, phone: string, email: string | null): User {
  const u: User = { id: uid('u_'), role, name, phone, email, lang: 'en', pushEnabled: true, referralCode: (name.split(' ')[0] || 'GETME').toUpperCase() + '50', createdAt: now() };
  db.putUser(u);
  if (role === 'customer') db.putLedger({ id: uid('l_'), userId: u.id, orderId: null, kind: 'topup', amount: 0, note: 'Wallet opened', at: now() });
  if (role === 'partner') db.putPartner({ id: uid('p_'), userId: u.id, name: u.name, initials: u.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'P', photoUrl: null, tier: 'runner', documents: [], verification: 'none', verificationNote: null, communityId: null, activeRunId: null, heading: null, speedKmh: null, trail: [], vehicle: 'Bike', plate: '', rating: 5, trips: 0, online: false, pos: null, posAt: null, area: 'Nearby', verified: false, activeOrderId: null, floatLimit: 1000 });
  if (role === 'shop') db.putShop({ id: uid('s_'), ownerId: u.id, name: `${u.name}'s shop`, photoUrl: null, approved: false, cat: 'Grocery', address: '', hours: '9 am – 9 pm', pos: { lat: 12.9121, lng: 77.6446 }, open: false, gstin: null, items: [], rating: 0, createdAt: now() });
  return u;
}
function session(u: User) { const t = token(); db.putSession({ token: t, userId: u.id, createdAt: now() }); return { token: t, ...me(svc.ctx(u)) }; }
function me(c: ReturnType<typeof svc.ctx>) {
  const { user } = c;
  const community = user.communityId ? db.getCommunity(user.communityId) : null;
  return { user, partner: c.partner, shop: c.shop, community, wallet: user.role === 'customer' ? db.balance(user.id) : undefined, addresses: user.role === 'customer' ? db.addresses(user.id) : undefined, favourites: user.role === 'customer' ? db.favourites(user.id) : undefined, vapidPublicKey: svc.push?.publicKey };
}

app.post<{ Body: { phone: string; role: Role } }>('/api/auth/otp', async (req) => {
  const { phone, role } = req.body ?? ({} as any);
  if (!ROLES.includes(role)) throw new DomainError('invalid', 'Unknown role');
  if (!validPhone(phone)) throw new DomainError('invalid', 'Enter a 10-digit mobile number');
  const code = DEV_OTP || otp4();
  db.putOtp({ phone: digits(phone), role, code, expiresAt: new Date(Date.now() + 5 * 60000).toISOString() });
  // Production: hand `code` to an SMS provider here. In dev the code is returned so the UI can show it.
  return { sent: true, devCode: DEV_OTP ? code : undefined };
});
app.post<{ Body: { phone: string; role: Role; code: string; name?: string } }>('/api/auth/verify', async (req) => {
  const { phone, role, code, name } = req.body ?? ({} as any);
  const p = digits(phone);
  if (!validOtp(code)) throw new DomainError('invalid', 'Enter the 4-digit code');
  const rec = db.getOtp(p, role);
  if (!rec || rec.code !== code.trim() || Date.parse(rec.expiresAt) < Date.now()) throw new DomainError('bad_code', 'That code is wrong or has expired');
  db.delOtp(p, role);
  const existing = db.findUserByPhone(p, role);
  if (!existing && role === 'admin') throw new DomainError('forbidden', 'Admin accounts are created by GetMe ops');
  const u = existing ?? newUser(role, name?.trim() || 'GetMe user', p, null);
  return session(u);
});
app.post<{ Body: { role: Role; email: string; name?: string } }>('/api/auth/google', async (req) => {
  // Stub for Google Sign-In: in production verify the ID token from Google here.
  const { role, email, name } = req.body ?? ({} as any);
  if (!ROLES.includes(role) || !validEmail(email)) throw new DomainError('invalid', 'Google sign-in failed');
  const u = db.findUserByEmail(email.toLowerCase(), role) ?? newUser(role, name?.trim() || email.split('@')[0], '', email.toLowerCase());
  return session(u);
});
app.post<{ Body: { role: Role; email: string; password: string; name?: string } }>('/api/auth/email', async (req) => {
  const { role, email, password, name } = req.body ?? ({} as any);
  if (!validEmail(email)) throw new DomainError('invalid', 'Enter a valid email address');
  if (!validPassword(password)) throw new DomainError('invalid', 'Enter your password');
  // Passwords are not stored in this build: the email path is a dev convenience, sign-ups complete by phone or Google.
  const u = db.findUserByEmail(email.toLowerCase(), role) ?? newUser(role, name?.trim() || email.split('@')[0], '', email.toLowerCase());
  return session(u);
});
app.post('/api/auth/logout', async (req) => { const h = req.headers.authorization ?? ''; if (h.startsWith('Bearer ')) db.delSession(h.slice(7)); return { ok: true }; });
app.get('/api/me', async (req) => me(ctxOf(req)));
app.patch<{ Body: Partial<User> }>('/api/me', async (req) => {
  const c = ctxOf(req); const b: any = req.body ?? {};
  const u = { ...c.user, name: b.name?.trim() || c.user.name, lang: b.lang ?? c.user.lang, pushEnabled: b.pushEnabled ?? c.user.pushEnabled, photoUrl: b.photoUrl === undefined ? c.user.photoUrl ?? null : b.photoUrl };
  db.putUser(u); if (c.partner && b.photoUrl !== undefined) db.putPartner({ ...c.partner, photoUrl: b.photoUrl }); return me(svc.ctx(u));
});
app.get('/api/notifications', async (req) => { const c = ctxOf(req); return db.notifications(c.user.id); });
app.post('/api/notifications/read', async (req) => { const c = ctxOf(req); db.markNotificationsRead(c.user.id); return { ok: true }; });

// ---------- uploads (photos, receipts): JSON data URL in, served URL out
app.post<{ Body: { dataUrl: string; name?: string } }>('/api/uploads', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
  ctxOf(req);
  const m = /^data:(image\/(png|jpeg|jpg|webp|svg\+xml));base64,(.+)$/.exec(req.body?.dataUrl ?? '');
  if (!m) throw new DomainError('invalid', 'Upload an image');
  const ext = m[2] === 'svg+xml' ? 'svg' : m[2] === 'jpeg' ? 'jpg' : m[2];
  const name = uid('img_') + '.' + ext;
  writeFileSync(join(UPLOADS, name), Buffer.from(m[3], 'base64'));
  return { url: '/uploads/' + name };
});

// ---------- customer
app.get<{ Querystring: { lat?: string; lng?: string; q?: string } }>('/api/shops', async (req) => {
  const c = ctxOf(req);
  const home = db.addresses(c.user.id)[0];
  const from = req.query.lat && req.query.lng ? { lat: Number(req.query.lat), lng: Number(req.query.lng) } : home ? { lat: home.lat, lng: home.lng } : { lat: 12.9121, lng: 77.6446 };
  const q = (req.query.q ?? '').trim().toLowerCase();
  return svc.shopsNear(from).filter(s => s.approved).filter(s => !q || s.name.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q) || s.items.some(i => i.name.toLowerCase().includes(q)));
});
app.get<{ Params: { id: string } }>('/api/shops/:id', async (req) => { const c = ctxOf(req); const s = db.getShop(req.params.id); if (!s) throw new DomainError('not_found', 'Shop not found'); const home = db.addresses(c.user.id)[0] ?? { lat: 12.9121, lng: 77.6446 }; return svc.shopCard(s, home); });
app.post('/api/orders/quote', async (req) => svc.quote(requireRole(req, 'customer'), req.body as any));
app.post('/api/orders', async (req) => { const c = requireRole(req, 'customer'); const o = svc.createOrder(c, { ...(req.body as any), idempotencyKey: (req.headers['idempotency-key'] as string | undefined) || (req.body as any)?.idempotencyKey }); return svc.view(o, 'customer'); });
app.get('/api/orders', async (req) => {
  const c = ctxOf(req);
  if (c.user.role === 'customer') return db.ordersByCustomer(c.user.id).map(o => svc.view(o, 'customer'));
  if (c.user.role === 'partner') return db.ordersByCourier(c.partner!.id).map(o => svc.view(o, 'partner', c));
  return db.ordersByShop(c.shop!.id).map(o => svc.view(o, 'shop'));
});
app.get<{ Params: { id: string } }>('/api/orders/:id', async (req) => {
  const c = ctxOf(req); const o = db.getOrder(req.params.id); if (!o) throw new DomainError('not_found', 'Order not found');
  if (c.user.role === 'customer' && o.customerId !== c.user.id) throw new DomainError('forbidden', 'Not your order');
  if (c.user.role === 'shop' && o.shopId !== c.shop?.id) throw new DomainError('forbidden', 'Not your order');
  if (c.user.role === 'partner') { if (o.courierId !== c.partner!.id && !svc.requestsFor(c).some(x => x.id === o.id) && !db.ordersByCourier(c.partner!.id).some(x => x.id === o.id)) throw new DomainError('forbidden', 'Not your job'); svc.markSeen(c, o.id); }
  return svc.view(o, c.user.role, c);
});
app.post<{ Params: { id: string }; Body: OrderEventInput }>('/api/orders/:id/events', async (req) => {
  const c = ctxOf(req);
  const { idempotencyKey, ...body } = (req.body as any) ?? {};
  const ev = { ...body, actor: c.user.role === 'admin' ? 'system' : c.user.role } as OrderEventInput;
  const o = svc.event(c, req.params.id, ev, (req.headers['idempotency-key'] as string | undefined) || idempotencyKey || undefined);
  return svc.view(o, c.user.role, c);
});
app.get<{ Params: { id: string } }>('/api/orders/:id/partners', async (req) => svc.choosable(requireRole(req, 'customer'), req.params.id));
app.get<{ Params: { id: string } }>('/api/orders/:id/messages', async (req) => { const c = ctxOf(req); const o = db.getOrder(req.params.id); if (!o || !svc.canChat(c, o)) throw new DomainError('forbidden', 'No chat for this order'); return db.messages(o.id); });
app.post<{ Params: { id: string }; Body: { type?: 'text' | 'photo' | 'location'; text: string; pos?: { lat: number; lng: number } } }>('/api/orders/:id/messages', async (req) => {
  const c = ctxOf(req); const o = db.getOrder(req.params.id); if (!o || !svc.canChat(c, o)) throw new DomainError('forbidden', 'No chat for this order');
  if (TERMINAL.has(o.status)) throw new DomainError('closed', 'This chat is closed');
  const b: any = req.body ?? {}; const text = (b.text ?? '').trim(); if (!text && b.type !== 'location') throw new DomainError('invalid', 'Message is empty');
  return svc.pushMessage(o, c.user.role as 'customer' | 'partner', b.type ?? 'text', text || 'Live location', b.pos ?? null);
});
app.post<{ Params: { id: string } }>('/api/orders/:id/share', async (req) => ({ token: svc.shareLink(requireRole(req, 'customer'), req.params.id) }));
app.get<{ Params: { token: string } }>('/api/track/:token', async (req) => { const v = svc.tracked(req.params.token); if (!v) throw new DomainError('not_found', 'Link expired'); return v; });
app.get('/api/wallet', async (req) => { const c = requireRole(req, 'customer'); return { balance: db.balance(c.user.id), ledger: db.ledger(c.user.id, 30) }; });
app.post<{ Body: { amount: number } }>('/api/wallet/topup', async (req) => ({ balance: svc.topup(requireRole(req, 'customer'), Number(req.body?.amount)) }));
app.get('/api/addresses', async (req) => db.addresses(ctxOf(req).user.id));
app.post<{ Body: any }>('/api/addresses', async (req) => {
  const c = ctxOf(req); const b: any = req.body ?? {};
  if (!(b.line || '').trim()) throw new DomainError('invalid', 'Enter the address');
  const home = db.addresses(c.user.id)[0];
  const keep = (k: string) => (b[k] ?? '').toString().trim() || undefined;
  const a = { id: b.id ?? uid('addr_'), label: (b.label || 'Other').trim(), line: b.line.trim(), area: keep('area'), landmark: keep('landmark'), building: keep('building'), tower: keep('tower'), floor: keep('floor'), flat: keep('flat'), directions: keep('directions'), gatePhotoUrl: b.gatePhotoUrl ?? null, handoff: ['in_person', 'gate', 'leave_at_door'].includes(b.handoff) ? b.handoff : 'in_person', source: b.source ?? 'typed', accuracyM: b.accuracyM ? Number(b.accuracyM) : undefined, communityId: c.user.communityId ?? null,
    lat: Number(b.lat) || (home?.lat ?? 12.9121) + (Math.random() - 0.5) * 0.02, lng: Number(b.lng) || (home?.lng ?? 77.6446) + (Math.random() - 0.5) * 0.02 };
  db.putAddress(c.user.id, a); if (b.makeDefault) { const rest = db.addresses(c.user.id).filter(x => x.id !== a.id); for (const x of rest) db.delAddress(c.user.id, x.id); db.putAddress(c.user.id, a); for (const x of rest) db.putAddress(c.user.id, x); } return db.addresses(c.user.id);
});
app.delete<{ Params: { id: string } }>('/api/addresses/:id', async (req) => { const c = ctxOf(req); db.delAddress(c.user.id, req.params.id); return db.addresses(c.user.id); });
app.post<{ Params: { partnerId: string } }>('/api/favourites/:partnerId', async (req) => { const c = requireRole(req, 'customer'); return { fav: db.toggleFavourite(c.user.id, req.params.partnerId), favourites: db.favourites(c.user.id) }; });
app.get('/api/subscriptions', async (req) => db.subs(requireRole(req, 'customer').user.id).filter(s => s.active));
app.post<{ Params: { id: string } }>('/api/subscriptions/:id/stop', async (req) => { const c = requireRole(req, 'customer'); svc.stopSubscription(c, req.params.id); return db.subs(c.user.id).filter(s => s.active); });
app.post<{ Body: { code: string; kind: 'list' | 'shop' | 'parcel'; delivery: number } }>('/api/promo/check', async (req) => { ctxOf(req); const b = req.body; const { promoFor } = await import('@getme/core'); return promoFor(b.code, b.kind, b.delivery); });

// ---------- partner
app.post<{ Body: { online: boolean } }>('/api/partner/online', async (req) => svc.setOnline(requireRole(req, 'partner'), !!req.body?.online));
app.post<{ Body: { lat: number; lng: number } }>('/api/partner/location', async (req) => { const b = req.body; if (typeof b?.lat !== 'number' || typeof b?.lng !== 'number') throw new DomainError('invalid', 'lat/lng required'); return svc.setLocation(requireRole(req, 'partner'), { lat: b.lat, lng: b.lng }); });
app.get('/api/partner/requests', async (req) => svc.requestsFor(requireRole(req, 'partner')));
app.get('/api/partner/active', async (req) => { const c = requireRole(req, 'partner'); const o = c.partner!.activeOrderId ? db.getOrder(c.partner!.activeOrderId) : null; return o ? svc.view(o, 'partner', c) : null; });
app.get('/api/partner/earnings', async (req) => svc.earnings(requireRole(req, 'partner')));
app.patch<{ Body: any }>('/api/partner', async (req) => {
  const c = requireRole(req, 'partner'); const b: any = req.body ?? {}; const cur = c.partner!;
  const docs = Array.isArray(b.documents) ? [...cur.documents, ...b.documents.filter((d: any) => d && d.url && ['id', 'licence', 'rc', 'selfie'].includes(d.kind)).map((d: any) => ({ kind: d.kind, url: String(d.url), at: now() }))] : cur.documents;
  const tier = b.tier === 'pro' || b.tier === 'runner' ? b.tier : cur.tier;
  const needed = tier === 'runner' ? ['id', 'selfie'] : ['id', 'licence', 'rc', 'selfie'];
  const complete = needed.every(k => docs.some(d => d.kind === k));
  const verification: Partner['verification'] = cur.verification === 'verified' ? 'verified' : complete ? 'pending' : cur.verification;
  const p = { ...cur, vehicle: b.vehicle ?? cur.vehicle, plate: b.plate ?? cur.plate, area: b.area ?? cur.area, photoUrl: b.photoUrl === undefined ? cur.photoUrl : b.photoUrl, tier, documents: docs, verification, floatLimit: tier === 'runner' ? Math.min(cur.floatLimit, 1000) : cur.floatLimit };
  db.putPartner(p);
  if (verification === 'pending' && cur.verification !== 'pending') for (const a of db.usersByRole('admin')) svc.notify(a.id, 'Partner awaiting verification', `${p.name} · ${tier}`, null, { url: '/admin' });
  return p;
});
app.get('/api/partner/runs', async (req) => { const c = requireRole(req, 'partner'); return db.runsByPartner(c.partner!.id).map(r => svc.runView(r, c)); });
app.post<{ Body: any }>('/api/runs', async (req) => svc.runView(svc.createRun(requireRole(req, 'partner'), req.body as any)));
app.get<{ Querystring: { lat?: string; lng?: string } }>('/api/runs', async (req) => { const c = ctxOf(req); const q = req.query; return svc.runsFor(c, q.lat && q.lng ? { lat: Number(q.lat), lng: Number(q.lng) } : undefined); });
app.get<{ Params: { id: string } }>('/api/runs/:id', async (req) => { const c = ctxOf(req); const r = db.getRun(req.params.id); if (!r) throw new DomainError('not_found', 'Trip not found'); return svc.runView(r, c); });
app.post<{ Params: { id: string } }>('/api/runs/:id/close', async (req) => svc.runView(svc.closeRun(requireRole(req, 'partner'), req.params.id)));
app.post<{ Params: { id: string } }>('/api/runs/:id/start', async (req) => { const c = requireRole(req, 'partner'); return svc.runView(svc.startRun(c, req.params.id), c); });
app.post<{ Params: { id: string } }>('/api/runs/:id/cancel', async (req) => { const c = ctxOf(req); return svc.runView(svc.cancelRun(c, req.params.id)); });
app.post<{ Params: { id: string }; Body: { orderId: string } }>('/api/runs/:id/focus', async (req) => { const c = requireRole(req, 'partner'); svc.focusRunOrder(c, req.params.id, (req.body as any)?.orderId); return { ok: true }; });

// ---------- communities
app.get('/api/communities', async (req) => { ctxOf(req); return db.listCommunities().map(c => ({ id: c.id, name: c.name, kind: c.kind, address: c.address, pos: c.pos, memberCount: c.memberCount })); });
app.post<{ Body: any }>('/api/communities', async (req) => svc.createCommunity(ctxOf(req), req.body as any));
app.post<{ Body: { code: string } }>('/api/communities/join', async (req) => svc.joinCommunity(ctxOf(req), (req.body as any)?.code));
app.post('/api/communities/leave', async (req) => { svc.leaveCommunity(ctxOf(req)); return { ok: true }; });
app.get('/api/community/board', async (req) => svc.board(ctxOf(req)));
app.post<{ Body: { text: string } }>('/api/community/announce', async (req) => svc.postAnnouncement(ctxOf(req), (req.body as any)?.text));

// ---------- geocoding (GPS → place, text → candidates)
app.get<{ Querystring: { lat: string; lng: string } }>('/api/geo/reverse', async (req) => { ctxOf(req); const lat = Number(req.query.lat), lng = Number(req.query.lng); if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new DomainError('invalid', 'lat/lng required'); const hit = await geoReverse(db, { lat, lng }); return { ...hit, region: svc.regionAt({ lat, lng }) }; });
app.get<{ Querystring: { q: string; lat?: string; lng?: string } }>('/api/geo/search', async (req) => { ctxOf(req); const q = req.query; return geoSearch(db, q.q ?? '', q.lat && q.lng ? { lat: Number(q.lat), lng: Number(q.lng) } : undefined); });
app.get<{ Querystring: { lat: string; lng: string } }>('/api/geo/region', async (req) => { ctxOf(req); return svc.regionAt({ lat: Number(req.query.lat), lng: Number(req.query.lng) }); });

// ---------- crypto payments
app.get('/api/crypto/rates', async (req) => { ctxOf(req); return { rates: await svc.crypto!.rates(), provider: svc.crypto!.provider, currencies: ['USDT', 'USDC'] }; });
app.get<{ Params: { id: string } }>('/api/orders/:id/crypto', async (req) => { const c = requireRole(req, 'customer'); const o = await svc.cryptoStatus(c, req.params.id); return svc.view(o, 'customer'); });
app.post<{ Params: { id: string }; Body: { currency?: 'USDT' | 'USDC' } }>('/api/orders/:id/crypto', async (req) => {
  const c = requireRole(req, 'customer'); const o = db.getOrder(req.params.id); if (!o || o.customerId !== c.user.id) throw new DomainError('not_found', 'Order not found');
  if (o.pay !== 'crypto') throw new DomainError('wrong_pay', 'This order is not paid in crypto');
  if (!(o.status === 'to_customer' || o.status === 'arrived' || o.status === 'delivered')) throw new DomainError('bad_state', 'The invoice is created once the final bill is known');
  const cur = (req.body as any)?.currency === 'USDC' ? 'USDC' : 'USDT';
  // switching currency (or an expired invoice) gets a fresh one; a paid invoice is never replaced
  if (o.crypto && o.crypto.status !== 'paid' && o.crypto.status !== 'confirming' && o.crypto.currency !== cur) { db.putOrder({ ...o, crypto: null }); }
  const next = await svc.ensureCryptoInvoice(o.id, cur);
  return svc.view(next!, 'customer');
});
app.post<{ Params: { id: string } }>('/api/orders/:id/crypto/simulate', async (req) => {
  // Development only: marks the simulated invoice as paid. Disabled for real providers.
  const c = requireRole(req, 'customer'); const o = db.getOrder(req.params.id); if (!o || o.customerId !== c.user.id || !o.crypto) throw new DomainError('not_found', 'No invoice');
  if (svc.crypto!.provider !== 'sim') throw new DomainError('forbidden', 'Simulated payments are off with a real provider');
  const next = svc.cryptoProviderUpdate(o.crypto.invoiceId, 'finished', '0xsim' + o.crypto.invoiceId.slice(4));
  return svc.view(next!, 'customer');
});
app.post('/api/crypto/webhook', { config: { rawBody: true } }, async (req, reply) => {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  if (!svc.crypto!.verifyWebhook(raw, req.headers['x-nowpayments-sig'] as string | undefined)) return reply.status(401).send({ error: 'bad_signature' });
  const b: any = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  svc.cryptoProviderUpdate(String(b.payment_id), String(b.payment_status), b.payin_hash ?? null);
  return { ok: true };
});

// ---------- web push
app.get('/api/push/vapid', async () => ({ publicKey: svc.push?.publicKey ?? null }));
app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>('/api/push/subscribe', async (req) => { const c = ctxOf(req); const b: any = req.body; if (!b?.endpoint || !b?.keys?.p256dh) throw new DomainError('invalid', 'Bad subscription'); db.putPushSub({ userId: c.user.id, endpoint: b.endpoint, keys: b.keys, at: now() }); return { ok: true }; });
app.post<{ Body: { endpoint: string } }>('/api/push/unsubscribe', async (req) => { ctxOf(req); db.delPushSub((req.body as any)?.endpoint ?? ''); return { ok: true }; });
app.post<{ Body: { token: string; platform: 'android' | 'ios'; app: 'customer' | 'partner' | 'shop' } }>('/api/push/native', async (req) => { const c = ctxOf(req); const b: any = req.body; if (!b?.token || !['android', 'ios'].includes(b.platform)) throw new DomainError('invalid', 'token and platform required'); db.putNativeToken({ userId: c.user.id, token: String(b.token), platform: b.platform, app: b.app ?? c.user.role, at: now() }); return { ok: true, fcm: svc.fcm?.enabled ?? false }; });
app.post<{ Body: { token: string } }>('/api/push/native/unregister', async (req) => { ctxOf(req); db.delNativeToken(String((req.body as any)?.token ?? '')); return { ok: true }; });
app.post('/api/push/test', async (req) => { const c = ctxOf(req); const n = await svc.push!.send(c.user.id, { title: 'GetMe', body: 'Push notifications are working', url: `/${c.user.role}` }); return { delivered: n }; });

// ---------- admin
app.get('/api/admin/overview', async (req) => { requireRole(req, 'admin'); return svc.adminOverview(); });
app.get('/api/admin/partners', async (req) => { requireRole(req, 'admin'); return db.listPartners().map(p => ({ ...p, user: db.getUser(p.userId) })); });
app.post<{ Params: { id: string }; Body: { decision: 'verified' | 'rejected'; note?: string } }>('/api/admin/partners/:id/verify', async (req) => { requireRole(req, 'admin'); const b: any = req.body; return svc.verifyPartner(req.params.id, b.decision, b.note); });
app.get('/api/admin/shops', async (req) => { requireRole(req, 'admin'); return db.listShops(); });
app.post<{ Params: { id: string }; Body: { approved: boolean } }>('/api/admin/shops/:id/approve', async (req) => { requireRole(req, 'admin'); return svc.approveShop(req.params.id, !!(req.body as any)?.approved); });
app.get('/api/admin/orders', async (req) => { requireRole(req, 'admin'); return db.allOrders(200).map(o => ({ ...svc.view(o, 'customer'), otp: undefined })); });
app.post<{ Params: { id: string }; Body: { approve: boolean; amount?: number } }>('/api/admin/refunds/:id', async (req) => { requireRole(req, 'admin'); const b: any = req.body; return svc.resolveRefund(req.params.id, !!b?.approve, b?.amount); });
app.put<{ Body: any[] }>('/api/admin/regions', async (req) => { requireRole(req, 'admin'); return svc.setRegionOverrides(Array.isArray(req.body) ? req.body : []); });
app.get('/api/admin/users', async (req) => { requireRole(req, 'admin'); return db.allUsers(); });
app.get('/api/regions', async (req) => { ctxOf(req); return svc.regions(); });

// ---------- shop
app.get('/api/shop', async (req) => requireRole(req, 'shop').shop);
app.patch<{ Body: any }>('/api/shop', async (req) => { const c = requireRole(req, 'shop'); const b: any = req.body ?? {}; const s = { ...c.shop!, open: typeof b.open === 'boolean' ? b.open : c.shop!.open, name: b.name?.trim() || c.shop!.name, hours: b.hours ?? c.shop!.hours, address: b.address ?? c.shop!.address, gstin: b.gstin === undefined ? c.shop!.gstin : b.gstin, cat: b.cat ?? c.shop!.cat, photoUrl: b.photoUrl === undefined ? c.shop!.photoUrl : b.photoUrl, pos: b.pos?.lat != null ? { lat: Number(b.pos.lat), lng: Number(b.pos.lng) } : c.shop!.pos }; db.putShop(s); bus.send(c.user.id, { type: 'shop.updated', shop: s }); return s; });
app.post<{ Body: any }>('/api/shop/items', async (req) => {
  const c = requireRole(req, 'shop'); const b: any = req.body ?? {}; const err = validateShopItem(b); if (err) throw new DomainError('invalid', err);
  const s = c.shop!; const item = { id: uid('i_'), shopId: s.id, name: b.name.trim(), photoUrl: b.photoUrl ?? null, unit: (b.unit || '1 pc').trim(), price: Math.round(Number(b.price)), cat: b.cat || 'Other', stock: Math.max(0, Math.round(Number(b.stock) || 0)), on: (Number(b.stock) || 0) > 0 };
  s.items = [item, ...s.items]; db.putShop(s); return s;
});
app.patch<{ Params: { id: string }; Body: any }>('/api/shop/items/:id', async (req) => {
  const c = requireRole(req, 'shop'); const s = c.shop!; const b: any = req.body ?? {};
  const i = s.items.findIndex(x => x.id === req.params.id); if (i < 0) throw new DomainError('not_found', 'Item not found');
  const it = s.items[i]; const next = { ...it, photoUrl: b.photoUrl === undefined ? it.photoUrl ?? null : b.photoUrl, name: b.name?.trim() || it.name, unit: b.unit ?? it.unit, price: b.price != null ? Math.round(Number(b.price)) : it.price, cat: b.cat ?? it.cat, stock: b.stock != null ? Math.max(0, Math.round(Number(b.stock))) : b.restock ? it.stock + Number(b.restock) : it.stock, on: typeof b.on === 'boolean' ? b.on : it.on };
  if (next.stock > 0 && (b.restock || b.stock != null) && typeof b.on !== 'boolean') next.on = true;
  if (next.stock === 0) next.on = false;
  s.items[i] = next; db.putShop(s); return s;
});
app.delete<{ Params: { id: string } }>('/api/shop/items/:id', async (req) => { const c = requireRole(req, 'shop'); const s = c.shop!; s.items = s.items.filter(x => x.id !== req.params.id); db.putShop(s); return s; });
app.get('/api/shop/orders', async (req) => { const c = requireRole(req, 'shop'); return db.ordersByShop(c.shop!.id).map(o => svc.view(o, 'shop')); });
app.post<{ Params: { id: string } }>('/api/shop/orders/:id/advance', async (req) => ({ shopStatus: svc.advanceShopOrder(requireRole(req, 'shop'), req.params.id) }));
app.post<{ Params: { id: string } }>('/api/shop/orders/:id/reject', async (req) => { const c = requireRole(req, 'shop'); const o = svc.event(c, req.params.id, { type: 'cancel', actor: 'shop', reason: 'Shop could not fulfil the order' }); return svc.view(o, 'shop'); });
app.get('/api/shop/analytics', async (req) => svc.shopAnalytics(requireRole(req, 'shop')));

// ---------- bootstrap snapshot per role (one call on app start)
app.get('/api/bootstrap', async (req) => {
  const c = ctxOf(req);
  if (c.user.role === 'customer') return { me: me(c), orders: db.ordersByCustomer(c.user.id).map(o => svc.view(o, 'customer')), subscriptions: db.subs(c.user.id).filter(s => s.active), notifications: db.notifications(c.user.id, 20), runs: svc.runsFor(c), board: svc.board(c) };
  if (c.user.role === 'partner') { const active = c.partner!.activeOrderId ? db.getOrder(c.partner!.activeOrderId) : null; const run = c.partner!.activeRunId ? db.getRun(c.partner!.activeRunId) : null; return { me: me(c), requests: svc.requestsFor(c), active: active ? svc.view(active, 'partner', c) : null, run: run ? svc.runView(run, c) : null, runs: db.runsByPartner(c.partner!.id).map(r => svc.runView(r, c)), earnings: svc.earnings(c), notifications: db.notifications(c.user.id, 20), board: svc.board(c) }; }
  if (c.user.role === 'admin') return { me: me(c), overview: svc.adminOverview(), notifications: db.notifications(c.user.id, 20) };
  return { me: me(c), orders: db.ordersByShop(c.shop!.id).map(o => svc.view(o, 'shop')), analytics: svc.shopAnalytics(c), notifications: db.notifications(c.user.id, 20) };
});

// ---------- realtime
app.get('/ws', { websocket: true }, (socket, req) => {
  const tok = (req.query as any)?.token as string | undefined;
  const track = (req.query as any)?.track as string | undefined;
  if (track) { bus.attach('track:' + track, socket); return; }
  const s = tok ? db.getSession(tok) : null;
  if (!s) { socket.close(4001, 'unauthorized'); return; }
  bus.attach(s.userId, socket);
  socket.on('message', (raw) => {
    try {
      const m = JSON.parse(String(raw));
      if (m.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      if (m.type === 'location' && typeof m.lat === 'number') { const u = db.getUser(s.userId); if (u?.role === 'partner') svc.setLocation(svc.ctx(u), { lat: m.lat, lng: m.lng }); }
    } catch { /* ignore */ }
  });
});

app.get('/api/health', async () => ({ ok: true, sim: SIM_BOTS, time: now(), push: !!svc.push, nativePush: svc.fcm?.enabled ?? false, sms: svc.sms?.provider }));

const ticker = setInterval(() => { try { svc.tick(); } catch (e) { app.log.error(e); } }, 5000);
app.addHook('onClose', async () => clearInterval(ticker));

await app.listen({ port: PORT, host: '0.0.0.0' });
const addr = app.server.address();
const port = typeof addr === 'object' && addr ? addr.port : PORT;
console.log(`GetMe API on http://localhost:${port} (db: ${DB_PATH}, bots: ${SIM_BOTS ? 'on' : 'off'}, dev OTP: ${DEV_OTP || 'off'})`);
