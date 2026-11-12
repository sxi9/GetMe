import type { LatLng } from './types.js';

const R = 6371;
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough urban travel estimate: two-wheeler at ~18 km/h effective + 3 min fixed. */
export function etaMinutes(km: number, speedKmh = 18): number {
  return Math.max(2, Math.round(3 + (km / speedKmh) * 60));
}

export function fmtKm(km: number): string {
  return km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km';
}

/** Point at fraction t along a polyline. */
export function posAlong(pts: LatLng[], t: number): LatLng {
  if (pts.length === 0) return { lat: 0, lng: 0 };
  if (pts.length === 1) return pts[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].lat - pts[i - 1].lat, pts[i].lng - pts[i - 1].lng);
    segs.push(L); total += L;
  }
  let dist = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, dist / segs[i]) : 0;
      return { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * f, lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * f };
    }
    dist -= segs[i];
  }
  return pts[pts.length - 1];
}

/** Fraction of the leg still to go, used for ETA on the customer side. */
export function remainingFraction(from: LatLng, to: LatLng, cur: LatLng): number {
  const total = haversineKm(from, to);
  if (total < 0.01) return 0;
  return Math.max(0, Math.min(1, haversineKm(cur, to) / total));
}

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180, φ2 = (b.lat * Math.PI) / 180, Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export type TrafficLevel = 'light' | 'moderate' | 'heavy';
/**
 * Traffic model without a traffic API: a time-of-day profile per kind of place
 * (city peaks 8–11 and 17–21 IST), corrected by the partner's observed speed when
 * we have one. Returns a multiplier on free-flow travel time and a label.
 */
export function trafficFactor(at: Date = new Date(), kind: 'city' | 'town' | 'hill' | 'village' = 'city', observedKmh?: number | null): { factor: number; level: TrafficLevel; freeFlowKmh: number } {
  const ist = new Date(at.getTime() + (330 + at.getTimezoneOffset()) * 60_000);
  const h = ist.getHours() + ist.getMinutes() / 60, wd = ist.getDay();
  const weekend = wd === 0 || wd === 6;
  const freeFlow = { city: 22, town: 28, hill: 24, village: 30 }[kind];
  let factor = 1;
  if (kind === 'city' || kind === 'town') {
    const peakAm = h >= 8 && h < 11, peakPm = h >= 17 && h < 21, shoulder = (h >= 7 && h < 8) || (h >= 11 && h < 12) || (h >= 16 && h < 17) || (h >= 21 && h < 22);
    factor = peakAm || peakPm ? (kind === 'city' ? 1.8 : 1.35) : shoulder ? 1.3 : h >= 23 || h < 6 ? 0.85 : 1.05;
    if (weekend && (peakAm || peakPm)) factor -= 0.3;
  } else if (kind === 'hill') {
    factor = h >= 10 && h < 18 && weekend ? 1.4 : 1.15; // tourist traffic and ghat roads
  } else {
    factor = h >= 23 || h < 5 ? 1.2 : 1; // village: night driving is slower, no congestion
  }
  // blend with what the partner is actually doing (ignore stops / noise below 3 km/h)
  if (observedKmh != null && observedKmh >= 3) { const obs = freeFlow / observedKmh; factor = Math.max(0.6, Math.min(3, factor * 0.5 + obs * 0.5)); }
  const level: TrafficLevel = factor >= 1.55 ? 'heavy' : factor >= 1.2 ? 'moderate' : 'light';
  return { factor: Math.round(factor * 100) / 100, level, freeFlowKmh: freeFlow };
}

/** ETA with traffic: free-flow time × factor + a fixed stop/parking allowance. */
export function etaWithTraffic(km: number, opts: { at?: Date; kind?: 'city' | 'town' | 'hill' | 'village'; observedKmh?: number | null } = {}): { min: number; level: TrafficLevel; factor: number } {
  const t = trafficFactor(opts.at, opts.kind, opts.observedKmh);
  const min = Math.max(1, Math.round(2 + ((km / t.freeFlowKmh) * 60) * t.factor));
  return { min, level: t.level, factor: t.factor };
}
