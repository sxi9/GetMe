import { DISPATCH } from './constants.js';
import { haversineKm } from './geo.js';
import { DEFAULT_REGION_ID, REGIONS } from './constants.js';
import type { LatLng, Order, Partner, RegionProfile, Run } from './types.js';

/** Pick the region profile for a point: the nearest named region whose coverage contains it, else the sparsest default. */
export function regionFor(pos: LatLng, regions: RegionProfile[] = REGIONS): RegionProfile {
  const hits = regions.filter(r => r.coverageKm > 0 && haversineKm(r.center, pos) <= r.coverageKm).sort((a, b) => haversineKm(a.center, pos) - haversineKm(b.center, pos));
  return hits[0] ?? regions.find(r => r.id === DEFAULT_REGION_ID) ?? regions[0];
}

/** Runs a customer at `pos` may attach an order to right now. */
export function joinableRuns(runs: Run[], pos: LatLng, communityId: string | null | undefined, now = Date.now(), maxKm = 30): Run[] {
  return runs.filter(r => r.status === 'open' && Date.parse(r.cutoffAt) > now && r.orderIds.length < r.capacity && (!r.communityId || r.communityId === communityId) && haversineKm(r.from, pos) <= maxKm)
    .sort((a, b) => Date.parse(a.departAt) - Date.parse(b.departAt));
}

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
    if (!p.online || !p.verified || p.activeOrderId || p.activeRunId) return false;
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
    .filter(p => p.online && p.verified && !p.activeOrderId && !p.activeRunId && locationFresh(p, now))
    .map(p => ({ partner: p, km: partnerDistanceKm(o, p) ?? 99, declined: o.declinedIds.includes(p.id) }))
    .filter(x => x.km <= (o.dispatch?.radiusKm ?? DISPATCH.radiusKm).slice(-1)[0])
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
  const d = o.dispatch ?? DISPATCH;
  if (age >= d.expireAfterMs) return 'expire';
  if (o.mode === 'choose' && o.chosenId) {
    const since = now - Date.parse(o.updatedAt);
    return since >= DISPATCH.chooseRespondMs ? 'chosen_timeout' : 'none';
  }
  if (o.mode !== 'choose') {
    const ladder = d.radiusKm;
    const wanted = ladder[Math.min(ladder.length - 1, Math.floor(age / d.expandEveryMs))];
    if (wanted > o.searchRadiusKm) return 'expand';
  }
  return 'none';
}
