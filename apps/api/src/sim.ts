// Dev-only partner simulator. Seeded partners other than Ravi behave like the
// bots in the design prototype so the product is demoable with one real
// partner logged in. Disabled with SIM_BOTS=0; never runs in production.
import { apply, eligiblePartners, posAlong, type LatLng, type Order } from '@getme/core';
import type { Service } from './service.js';

const BOT_IDS = ['fathima', 'arjun', 'manoj'];
const OFFERS: Record<string, [number, number, number]> = { fathima: [45, 14, 2500], arjun: [60, 9, 5500], manoj: [38, 18, 8500] };

export class Sim {
  private timers = new Map<string, NodeJS.Timeout[]>();
  private handled = new Set<string>();
  constructor(private svc: Service, private speed = 1) {
    // Idle bots keep a fresh location so they stay eligible for dispatch.
    setInterval(() => { for (const id of BOT_IDS) { const p = this.svc.db.getPartner(id); if (p && !p.activeOrderId && p.pos) this.svc.db.putPartner({ ...p, posAt: new Date().toISOString() }); } }, 30_000).unref();
  }

  private after(orderId: string, ms: number, fn: () => void) {
    const id = setTimeout(() => { try { fn(); } catch (e) { console.error('[sim]', (e as Error).message); } }, ms * this.speed);
    if (!this.timers.has(orderId)) this.timers.set(orderId, []);
    this.timers.get(orderId)!.push(id);
  }
  private clear(orderId: string) { for (const t of this.timers.get(orderId) ?? []) clearTimeout(t); this.timers.delete(orderId); }
  private fresh(id: string) { return this.svc.db.getOrder(id); }
  private bot(id: string) { return this.svc.db.getPartner(id)!; }
  private sys(o: Order, ev: any) { const r = apply(o, ev); if (r.ok) return this.svc.commit(o, r.order, ev); return null; }

  /** Called whenever an order is created or re-opened. */
  onOpen(o: Order) {
    if (this.handled.has(o.id + ':' + o.updatedAt)) return;
    this.handled.add(o.id + ':' + o.updatedAt);
    this.clear(o.id);
    const bots = BOT_IDS.map(id => this.bot(id)).filter(Boolean);
    const eligible = eligiblePartners(o, bots).map(p => p.id);
    // mark as seen in a staggered way
    eligible.forEach((pid, i) => this.after(o.id, 1500 + i * 1000, () => { const cur = this.fresh(o.id); if (cur) this.svc.markSeen(this.svc.ctx(this.svc.db.getUser(this.bot(pid).userId)!), o.id); }));
    if (o.mode === 'offers') {
      for (const pid of eligible) {
        const [price, eta, delay] = OFFERS[pid];
        this.after(o.id, delay, () => { const cur = this.fresh(o.id); if (cur && cur.status === 'requesting' && !cur.courierId) this.sys(cur, { type: 'offer', actor: 'partner', partnerId: pid, partnerName: this.bot(pid).name, price, etaMin: eta }); });
      }
    } else if (o.mode === 'broadcast') {
      // fall back to a bot after 40 s if no real partner took it
      this.after(o.id, 40_000, () => { const cur = this.fresh(o.id); const pid = eligible[0]; if (cur && (cur.status === 'requesting') && !cur.courierId && pid) this.assign(cur, pid); });
    } else if (o.mode === 'choose' && o.chosenId && BOT_IDS.includes(o.chosenId)) {
      const pid = o.chosenId;
      this.after(o.id, 3000, () => {
        const cur = this.fresh(o.id); if (!cur || cur.chosenId !== pid || cur.status !== 'requesting') return;
        if (pid === 'arjun') this.sys(cur, { type: 'counter', actor: 'partner', partnerId: pid, partnerName: this.bot(pid).name, amount: 20, reason: 'Far pickup' });
        else this.assign(cur, pid);
      });
    }
  }
  /** Customer declined a bot's counter: the bot accepts at base fee a moment later. */
  onCounterDeclined(o: Order, pid: string) {
    if (!BOT_IDS.includes(pid)) return;
    this.after(o.id, 2500, () => { const cur = this.fresh(o.id); if (cur && cur.status === 'requesting' && !cur.courierId) this.assign(cur, pid); });
  }
  /** A bot got the job (by accept, offer or counter). Drive it to completion with moving location. */
  onAssigned(o: Order) {
    if (!o.courierId || !BOT_IDS.includes(o.courierId)) return;
    this.clear(o.id);
    const pid = o.courierId;
    const ctx = () => this.svc.ctx(this.svc.db.getUser(this.bot(pid).userId)!);
    const start = this.bot(pid).pos ?? o.address;
    const origin: LatLng = o.shopPos ?? o.pickup ?? { lat: o.address.lat + 0.004, lng: o.address.lng + 0.004 };
    const move = (from: LatLng, to: LatLng, dur: number, done: () => void) => {
      const steps = 12;
      for (let i = 1; i <= steps; i++) this.after(o.id, (dur * i) / steps, () => { const cur = this.fresh(o.id); if (!cur || cur.courierId !== pid) return; this.svc.setLocation(ctx(), posAlong([from, to], i / steps)); if (i === steps) done(); });
    };
    move(start, origin, 8000, () => {
      const cur = this.fresh(o.id); if (!cur || cur.status !== 'to_shop') return;
      const r1 = this.sys(cur, { type: 'reached', actor: 'partner', partnerId: pid }); if (!r1) return;
      this.after(o.id, 5500, () => {
        const c2 = this.fresh(o.id); if (!c2 || c2.status !== 'shopping') return;
        const cost = c2.kind === 'parcel' ? null : c2.itemsTotal != null ? c2.itemsTotal : c2.items.reduce((a, i) => a + 55 * i.qty, 0);
        const r2 = this.sys(c2, { type: 'bought', actor: 'partner', partnerId: pid, itemCost: cost, receiptUrl: c2.kind === 'parcel' ? '/uploads/sample-pickup.svg' : '/uploads/sample-receipt.svg' }); if (!r2) return;
        move(origin, c2.address, 18000, () => {
          const c3 = this.fresh(o.id); if (!c3 || c3.status !== 'to_customer') return;
          const r3 = this.sys(c3, { type: 'arrived', actor: 'partner', partnerId: pid }); if (!r3) return;
          this.after(o.id, 4000, () => { const c4 = this.fresh(o.id); if (c4 && c4.status === 'arrived') this.sys(c4, { type: 'complete', actor: 'partner', partnerId: pid, otp: c4.otp, cashCollected: true }); });
        });
      });
    });
  }
  onMessage(o: Order, from: string) {
    if (from !== 'customer' || !o.courierId || !BOT_IDS.includes(o.courierId)) return;
    this.after(o.id, 1800, () => { const cur = this.fresh(o.id); if (cur && cur.courierId === o.courierId) this.svc.pushMessage(cur, 'partner', 'text', 'Sure, will do.'); });
  }
  onClosed(o: Order) { this.clear(o.id); }
  private assign(o: Order, pid: string) { const r = this.sys(o, { type: 'assign', actor: 'system', partnerId: pid, partnerName: this.bot(pid).name }); if (r) this.onAssigned(r); }
}
