// SQLite via node:sqlite (Node 22+). Rich objects are stored as JSON columns —
// the domain model lives in @getme/core, the DB is a document store with a
// few indexed columns for the queries we actually run.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LedgerEntry, Message, Notification, Order, Partner, Shop, Subscription, User } from '@getme/core';

export interface Session { token: string; userId: string; createdAt: string }
export interface Otp { phone: string; code: string; role: string; expiresAt: string }

export class Db {
  sql: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.sql.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, role TEXT NOT NULL, phone TEXT, email TEXT, data TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS users_phone_role ON users(phone, role);
      CREATE TABLE IF NOT EXISTS otps (phone TEXT NOT NULL, role TEXT NOT NULL, code TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(phone, role));
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, courier_id TEXT, shop_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id, created_at);
      CREATE INDEX IF NOT EXISTS orders_courier ON orders(courier_id, created_at);
      CREATE INDEX IF NOT EXISTS orders_shop ON orders(shop_id, created_at);
      CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
      CREATE TABLE IF NOT EXISTS shop_orders (order_id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_order ON messages(order_id, at);
      CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, order_id TEXT, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, at);
      CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, at);
      CREATE TABLE IF NOT EXISTS addresses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS favourites (user_id TEXT NOT NULL, partner_id TEXT NOT NULL, PRIMARY KEY(user_id, partner_id));
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
  }
  private row<T>(sql: string, ...args: any[]): T | null {
    const r = this.sql.prepare(sql).get(...args) as { data?: string } | undefined;
    return r?.data ? (JSON.parse(r.data) as T) : null;
  }
  private rows<T>(sql: string, ...args: any[]): T[] {
    return (this.sql.prepare(sql).all(...args) as { data: string }[]).map(r => JSON.parse(r.data) as T);
  }

  // ---- meta
  getMeta(k: string): string | null { const r = this.sql.prepare('SELECT v FROM meta WHERE k=?').get(k) as { v: string } | undefined; return r?.v ?? null; }
  setMeta(k: string, v: string) { this.sql.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v); }
  nextOrderNo(): number { const n = Number(this.getMeta('order_no') ?? '2040') + 1; this.setMeta('order_no', String(n)); return n; }

  // ---- users / auth
  getUser(id: string) { return this.row<User>('SELECT data FROM users WHERE id=?', id); }
  findUserByPhone(phone: string, role: string) { return this.row<User>('SELECT data FROM users WHERE phone=? AND role=?', phone, role); }
  findUserByEmail(email: string, role: string) { return this.row<User>('SELECT data FROM users WHERE email=? AND role=?', email, role); }
  putUser(u: User) { this.sql.prepare('INSERT INTO users(id,role,phone,email,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,email=excluded.email,data=excluded.data').run(u.id, u.role, u.phone, u.email, JSON.stringify(u)); }
  putOtp(o: Otp) { this.sql.prepare('INSERT INTO otps(phone,role,code,expires_at) VALUES(?,?,?,?) ON CONFLICT(phone,role) DO UPDATE SET code=excluded.code,expires_at=excluded.expires_at').run(o.phone, o.role, o.code, o.expiresAt); }
  getOtp(phone: string, role: string): Otp | null { const r = this.sql.prepare('SELECT phone,role,code,expires_at as expiresAt FROM otps WHERE phone=? AND role=?').get(phone, role) as any; return r ?? null; }
  delOtp(phone: string, role: string) { this.sql.prepare('DELETE FROM otps WHERE phone=? AND role=?').run(phone, role); }
  putSession(s: Session) { this.sql.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)').run(s.token, s.userId, s.createdAt); }
  getSession(token: string): Session | null { const r = this.sql.prepare('SELECT token,user_id as userId,created_at as createdAt FROM sessions WHERE token=?').get(token) as any; return r ?? null; }
  delSession(token: string) { this.sql.prepare('DELETE FROM sessions WHERE token=?').run(token); }

  // ---- shops
  listShops() { return this.rows<Shop>('SELECT data FROM shops'); }
  getShop(id: string) { return this.row<Shop>('SELECT data FROM shops WHERE id=?', id); }
  getShopByOwner(ownerId: string) { return this.row<Shop>('SELECT data FROM shops WHERE owner_id=?', ownerId); }
  putShop(s: Shop) { this.sql.prepare('INSERT INTO shops(id,owner_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(s.id, s.ownerId, JSON.stringify(s)); }

  // ---- partners
  listPartners() { return this.rows<Partner>('SELECT data FROM partners'); }
  getPartner(id: string) { return this.row<Partner>('SELECT data FROM partners WHERE id=?', id); }
  getPartnerByUser(userId: string) { return this.row<Partner>('SELECT data FROM partners WHERE user_id=?', userId); }
  putPartner(p: Partner) { this.sql.prepare('INSERT INTO partners(id,user_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(p.id, p.userId, JSON.stringify(p)); }

  // ---- orders
  getOrder(id: string) { return this.row<Order>('SELECT data FROM orders WHERE id=?', id); }
  putOrder(o: Order) {
    this.sql.prepare('INSERT INTO orders(id,customer_id,courier_id,shop_id,status,created_at,data) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET courier_id=excluded.courier_id,status=excluded.status,data=excluded.data')
      .run(o.id, o.customerId, o.courierId, o.shopId, o.status, o.createdAt, JSON.stringify(o));
  }
  ordersByCustomer(customerId: string, limit = 50) { return this.rows<Order>('SELECT data FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT ?', customerId, limit); }
  ordersByCourier(courierId: string, limit = 50) { return this.rows<Order>('SELECT data FROM orders WHERE courier_id=? ORDER BY created_at DESC LIMIT ?', courierId, limit); }
  ordersByShop(shopId: string, limit = 100) { return this.rows<Order>('SELECT data FROM orders WHERE shop_id=? ORDER BY created_at DESC LIMIT ?', shopId, limit); }
  ordersByStatus(statuses: string[]) { return this.rows<Order>(`SELECT data FROM orders WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY created_at ASC`, ...statuses); }
  openOrders() { return this.ordersByStatus(['requesting', 'counter']); }
  activeOrderForCustomer(customerId: string) { return this.rows<Order>("SELECT data FROM orders WHERE customer_id=? AND status IN ('requesting','counter','to_shop','shopping','to_customer','arrived') ORDER BY created_at DESC LIMIT 1", customerId)[0] ?? null; }
  activeOrdersForCustomer(customerId: string) { return this.rows<Order>("SELECT data FROM orders WHERE customer_id=? AND status IN ('requesting','counter','to_shop','shopping','to_customer','arrived') ORDER BY created_at DESC", customerId); }

  // shop-side status
  getShopStatus(orderId: string): string | null { const r = this.sql.prepare('SELECT status FROM shop_orders WHERE order_id=?').get(orderId) as any; return r?.status ?? null; }
  putShopStatus(orderId: string, shopId: string, status: string) { this.sql.prepare('INSERT INTO shop_orders(order_id,shop_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').run(orderId, shopId, status, new Date().toISOString()); }

  // ---- messages
  putMessage(m: Message) { this.sql.prepare('INSERT INTO messages(id,order_id,at,data) VALUES(?,?,?,?)').run(m.id, m.orderId, m.at, JSON.stringify(m)); }
  messages(orderId: string) { return this.rows<Message>('SELECT data FROM messages WHERE order_id=? ORDER BY at ASC', orderId); }

  // ---- ledger
  putLedger(e: LedgerEntry) { this.sql.prepare('INSERT INTO ledger(id,user_id,order_id,at,data) VALUES(?,?,?,?,?)').run(e.id, e.userId, e.orderId, e.at, JSON.stringify(e)); }
  ledger(userId: string, limit = 100) { return this.rows<LedgerEntry>('SELECT data FROM ledger WHERE user_id=? ORDER BY at DESC LIMIT ?', userId, limit); }
  balance(userId: string): number { const r = this.sql.prepare("SELECT COALESCE(SUM(json_extract(data,'$.amount')),0) AS b FROM ledger WHERE user_id=?").get(userId) as any; return Number(r?.b ?? 0); }

  // ---- subscriptions
  putSub(s: Subscription) { this.sql.prepare('INSERT INTO subscriptions(id,customer_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(s.id, s.customerId, JSON.stringify(s)); }
  subs(customerId: string) { return this.rows<Subscription>('SELECT data FROM subscriptions WHERE customer_id=?', customerId); }
  allSubs() { return this.rows<Subscription>('SELECT data FROM subscriptions'); }
  getSub(id: string) { return this.row<Subscription>('SELECT data FROM subscriptions WHERE id=?', id); }

  // ---- notifications
  putNotification(n: Notification) { this.sql.prepare('INSERT INTO notifications(id,user_id,at,data) VALUES(?,?,?,?)').run(n.id, n.userId, n.at, JSON.stringify(n)); }
  notifications(userId: string, limit = 50) { return this.rows<Notification>('SELECT data FROM notifications WHERE user_id=? ORDER BY at DESC LIMIT ?', userId, limit); }
  markNotificationsRead(userId: string) {
    const all = this.notifications(userId, 500);
    for (const n of all) if (!n.read) this.sql.prepare('UPDATE notifications SET data=? WHERE id=?').run(JSON.stringify({ ...n, read: true }), n.id);
  }

  // ---- addresses & favourites
  addresses(userId: string) { return this.rows<any>('SELECT data FROM addresses WHERE user_id=?', userId); }
  putAddress(userId: string, a: any) { this.sql.prepare('INSERT INTO addresses(id,user_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(a.id, userId, JSON.stringify(a)); }
  delAddress(userId: string, id: string) { this.sql.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').run(id, userId); }
  favourites(userId: string): string[] { return (this.sql.prepare('SELECT partner_id FROM favourites WHERE user_id=?').all(userId) as any[]).map(r => r.partner_id); }
  toggleFavourite(userId: string, partnerId: string): boolean {
    const has = this.favourites(userId).includes(partnerId);
    if (has) this.sql.prepare('DELETE FROM favourites WHERE user_id=? AND partner_id=?').run(userId, partnerId);
    else this.sql.prepare('INSERT INTO favourites(user_id,partner_id) VALUES(?,?)').run(userId, partnerId);
    return !has;
  }
}
