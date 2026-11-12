// Ops command line. Run from apps/api:
//   pnpm ops admin:create --phone 9000000001 --name "Asha Ops"
//   pnpm ops admin:list
//   pnpm ops partner:verify --id suresh            (or --phone 9986044117)
//   pnpm ops shop:approve --id nandini --approved true
//   pnpm ops region:set --id hill --surcharge 1.4 --expireMin 240
//   pnpm ops seed:reset                            (deletes the database; re-seeded on next start)
//   pnpm ops stats
import { rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Db } from './db.js';
import { now, uid } from './ids.js';
import { seed } from './seed.js';

const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'getme.db');
const [cmd, ...rest] = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { args[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true'; }
const need = (k: string) => { if (!args[k]) { console.error(`--${k} is required`); process.exit(2); } return args[k]; };

if (cmd === 'seed:reset') {
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) if (existsSync(f)) rmSync(f);
  console.log('Database removed. It will be re-created and seeded when the API starts.');
  process.exit(0);
}
const db = new Db(DB_PATH);
seed(db);

switch (cmd) {
  case 'admin:create': {
    const phone = need('phone').replace(/\D/g, ''); const name = args.name ?? 'GetMe Ops';
    if (phone.length !== 10) { console.error('Phone must be 10 digits'); process.exit(2); }
    if (db.findUserByPhone(phone, 'admin')) { console.log('Admin already exists for', phone); break; }
    db.putUser({ id: uid('u_'), role: 'admin', name, phone, email: args.email ?? null, lang: 'en', pushEnabled: true, referralCode: 'OPS', createdAt: now() });
    console.log(`Admin created: ${name} (+91 ${phone}). Sign in at /admin with the OTP${process.env.DEV_OTP === '' ? '' : ' (dev code ' + (process.env.DEV_OTP ?? '1234') + ')'}.`);
    break;
  }
  case 'admin:list': { for (const u of db.usersByRole('admin')) console.log(u.id, u.name, '+91 ' + u.phone, u.email ?? ''); break; }
  case 'partner:verify': {
    let p = args.id ? db.getPartner(args.id) : null;
    if (!p && args.phone) { const u = db.findUserByPhone(args.phone.replace(/\D/g, ''), 'partner'); if (u) p = db.getPartnerByUser(u.id); }
    if (!p) { console.error('Partner not found'); process.exit(1); }
    const decision = args.reject ? 'rejected' : 'verified';
    db.putPartner({ ...p, verification: decision, verified: decision === 'verified', verificationNote: args.note ?? null });
    console.log(`${p.name}: ${decision}`); break;
  }
  case 'shop:approve': {
    const s = db.getShop(need('id')); if (!s) { console.error('Shop not found'); process.exit(1); }
    const approved = (args.approved ?? 'true') !== 'false';
    db.putShop({ ...s, approved }); console.log(`${s.name}: ${approved ? 'approved' : 'paused'}`); break;
  }
  case 'region:set': {
    const id = need('id');
    const raw = db.getMeta('regions'); const over: any[] = raw ? JSON.parse(raw) : [];
    const cur = over.find(o => o.id === id) ?? { id };
    const num = (k: string) => (args[k] != null ? Number(args[k]) : undefined);
    const patch: any = { surcharge: num('surcharge'), deliveryBase: num('base'), deliveryPerKm: num('perKm'), deliveryMin: num('min'), deliveryMax: num('max'), expireAfterMs: args.expireMin ? Number(args.expireMin) * 60_000 : undefined, expandEveryMs: args.expandMin ? Number(args.expandMin) * 60_000 : undefined, radiusKm: args.radius ? args.radius.split(',').map(Number) : undefined, defaultPay: args.defaultPay, defaultMode: args.defaultMode, coverageKm: num('coverageKm') };
    for (const k of Object.keys(patch)) if (patch[k] === undefined || Number.isNaN(patch[k])) delete patch[k];
    const next = over.filter(o => o.id !== id).concat([{ ...cur, ...patch }]);
    db.setMeta('regions', JSON.stringify(next)); console.log('Region overrides:', JSON.stringify(next)); break;
  }
  case 'stats': {
    const orders = db.allOrders(100000); const by: Record<string, number> = {};
    for (const o of orders) by[o.status] = (by[o.status] ?? 0) + 1;
    console.log('users', db.allUsers().length, '| partners', db.listPartners().length, '| shops', db.listShops().length, '| orders', orders.length, by);
    console.log('open runs', db.openRuns().length, '| communities', db.listCommunities().length, '| refund requests', db.refundRequests().length);
    break;
  }
  default:
    console.log('Commands: admin:create, admin:list, partner:verify, shop:approve, region:set, seed:reset, stats');
}
