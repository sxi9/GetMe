import { DISPATCH } from './constants.js';
import { haversineKm } from './geo.js';
import type { Order, Partner } from './types.js';

/** Where a partner must be near to receive this request. */
export function requestOrigin(o: Order) {
  return o.shopPos ?? o.pickup ?? o.address;
}

export function partnerDistanceKm(o: Order, p: Partner): number | null {
  if (!p.pos) return null;
  return haversineKm(requestOrigin(o), p.pos);
}

export function locationFresh(p: Partner, now = Date.now()): boolean {
  return !!p.posAt && now - Date.parse(p.posAt) < DISPATCH.locationTtlMs;
}

/** Which partners should currently see this request. */
export function eligiblePartners(o: Order, partners: Partner[], now = Date.now()): Partner[] {
  if (o.status !== 'requesting' && o.status !== 'counter') return [];
  if (o.courierId) return [];
  return partners.filter(p => {
    if (!p.online || !p.verified || p.activeOrderId) return false;
    if (o.declinedIds.includes(p.id)) return false;
    if (o.mode === 'choose') return o.chosenId === p.id;
    if (!locationFresh(p, now)) return false;
    const d = partnerDistanceKm(o, p);
    return d != null && d <= o.searchRadiusKm;
  });
}

/** Partners a customer may pick from in choose mode (online, free, nearby; declined ones are shown but flagged). */
export function choosablePartners(o: Order, partners: Partner[], now = Date.now()) {
  return partners
    .filter(p => p.online && p.verified && !p.activeOrderId && locationFresh(p, now))
    .map(p => ({ partner: p, km: partnerDistanceKm(o, p) ?? 99, declined: o.declinedIds.includes(p.id) }))
    .filter(x => x.km <= DISPATCH.radiusKm[DISPATCH.radiusKm.length - 1])
    .sort((a, b) => a.km - b.km);
}

/** Scheduled orders stay dormant until this returns true. */
export function isDue(o: Order, now = Date.now()): boolean {
  if (o.when !== 'schedule' || !o.scheduledAt) return true;
  return Date.parse(o.scheduledAt) <= now;
}

export function openedAt(o: Order): number {
  return Date.parse(o.times.requesting ?? o.createdAt);
}

/** What the dispatcher should do for an open order right now. */
export function dispatchTick(o: Order, now = Date.now()): 'none' | 'expand' | 'expire' | 'chosen_timeout' {
  if (o.status !== 'requesting' && o.status !== 'counter') return 'none';
  if (!isDue(o, now)) return 'none';
  const age = now - openedAt(o);
  if (age >= DISPATCH.expireAfterMs) return 'expire';
  if (o.mode === 'choose' && o.chosenId) {
    const since = now - Date.parse(o.updatedAt);
    return since >= DISPATCH.chooseRespondMs ? 'chosen_timeout' : 'none';
  }
  if (o.mode !== 'choose') {
    const ladder = DISPATCH.radiusKm;
    const wanted = ladder[Math.min(ladder.length - 1, Math.floor(age / DISPATCH.expandEveryMs))];
    if (wanted > o.searchRadiusKm) return 'expand';
  }
  return 'none';
}
