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
