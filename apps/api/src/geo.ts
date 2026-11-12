// Geocoding: GPS → readable place and text → candidates. Nominatim (OpenStreetMap)
// with a persistent cache, and a local gazetteer so the app still answers when the
// provider is rate-limited or the device is offline-ish. Swap `provider` for Google
// Places / Mapbox by setting GEOCODER=google and GOOGLE_MAPS_KEY.
import { haversineKm, type LatLng } from '@getme/core';
import type { Db } from './db.js';

export interface GeoHit { line: string; area: string; lat: number; lng: number; source: 'nominatim' | 'gazetteer' | 'google' }

const GAZETTEER: { name: string; area: string; lat: number; lng: number }[] = [
  { name: 'HSR Layout Sector 1', area: 'HSR Layout', lat: 12.9081, lng: 77.6398 }, { name: 'HSR Layout Sector 2', area: 'HSR Layout', lat: 12.9121, lng: 77.6446 }, { name: 'HSR Layout Sector 3', area: 'HSR Layout', lat: 12.9170, lng: 77.6500 },
  { name: 'HSR Layout Sector 7', area: 'HSR Layout', lat: 12.9040, lng: 77.6560 }, { name: 'Agara', area: 'HSR Layout', lat: 12.9220, lng: 77.6450 }, { name: 'Koramangala 4th Block', area: 'Koramangala', lat: 12.9339, lng: 77.6210 },
  { name: 'Koramangala 5th Block', area: 'Koramangala', lat: 12.9345, lng: 77.6145 }, { name: 'Madiwala', area: 'Madiwala', lat: 12.9226, lng: 77.6174 }, { name: 'BTM Layout 2nd Stage', area: 'BTM Layout', lat: 12.9166, lng: 77.6101 },
  { name: 'Bellandur', area: 'Bellandur', lat: 12.9260, lng: 77.6762 }, { name: 'Sarjapur Road', area: 'Sarjapur Road', lat: 12.9100, lng: 77.6800 }, { name: 'Kadubeesanahalli', area: 'Marathahalli', lat: 12.9353, lng: 77.6975 },
  { name: 'Indiranagar', area: 'Indiranagar', lat: 12.9784, lng: 77.6408 }, { name: 'Jayanagar 4th Block', area: 'Jayanagar', lat: 12.9250, lng: 77.5938 }, { name: 'Electronic City Phase 1', area: 'Electronic City', lat: 12.8452, lng: 77.6602 },
  { name: 'Madikeri town', area: 'Kodagu', lat: 12.4244, lng: 75.7382 }, { name: 'Kakkabe', area: 'Kodagu', lat: 12.3620, lng: 75.6450 }, { name: 'Virajpet', area: 'Kodagu', lat: 12.1960, lng: 75.8060 }, { name: 'Kushalnagar', area: 'Kodagu', lat: 12.4580, lng: 75.9580 },
  { name: 'Chikmagalur town', area: 'Chikmagalur', lat: 13.3153, lng: 75.7754 }, { name: 'Ooty', area: 'Nilgiris', lat: 11.4102, lng: 76.6950 }, { name: 'Coonoor', area: 'Nilgiris', lat: 11.3530, lng: 76.7959 },
];

const UA = 'GetMe/0.2 (local delivery app)';
const nominatimOk = (process.env.GEOCODER ?? 'nominatim') === 'nominatim';
let backoffUntil = 0;

async function fetchJson(url: string, ms = 4000): Promise<any | null> {
  if (Date.now() < backoffUntil) return null;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
    if (r.status === 429 || r.status === 403) { backoffUntil = Date.now() + 5 * 60_000; return null; }
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null;
    return await r.json();
  } catch { return null; }
}

function nearest(pos: LatLng): GeoHit {
  const g = [...GAZETTEER].sort((a, b) => haversineKm(a, pos) - haversineKm(b, pos))[0];
  const km = haversineKm(g, pos);
  const line = km < 0.4 ? g.name : `${km.toFixed(1)} km from ${g.name}`;
  return { line, area: g.area, lat: pos.lat, lng: pos.lng, source: 'gazetteer' };
}

export async function reverse(db: Db, pos: LatLng): Promise<GeoHit> {
  const k = `r:${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`;
  const c = db.geoGet(k); if (c) return c;
  if (nominatimOk) {
    const j = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.lat}&lon=${pos.lng}&zoom=17&addressdetails=1`);
    const a = j?.address;
    if (a) {
      const line = [a.house_number, a.road ?? a.pedestrian ?? a.neighbourhood, a.suburb ?? a.village ?? a.town].filter(Boolean).join(', ') || j.display_name?.split(',').slice(0, 3).join(',');
      const area = [a.suburb ?? a.neighbourhood ?? a.village, a.city ?? a.town ?? a.county ?? a.state_district].filter(Boolean).join(', ');
      const hit: GeoHit = { line, area, lat: pos.lat, lng: pos.lng, source: 'nominatim' };
      db.geoPut(k, hit); return hit;
    }
  }
  return nearest(pos);
}

export async function search(db: Db, q: string, near?: LatLng): Promise<GeoHit[]> {
  const t = q.trim().toLowerCase(); if (!t) return [];
  const local = GAZETTEER.filter(g => g.name.toLowerCase().includes(t) || g.area.toLowerCase().includes(t)).map<GeoHit>(g => ({ line: g.name, area: g.area, lat: g.lat, lng: g.lng, source: 'gazetteer' }));
  const k = `s:${t}:${near ? near.lat.toFixed(2) + ',' + near.lng.toFixed(2) : ''}`;
  const c = db.geoGet(k);
  let remote: GeoHit[] = c ?? [];
  if (!c && nominatimOk && t.length >= 3) {
    const vb = near ? `&viewbox=${near.lng - 0.5},${near.lat + 0.5},${near.lng + 0.5},${near.lat - 0.5}&bounded=0` : '';
    const j = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=6&addressdetails=1&q=${encodeURIComponent(q)}${vb}`);
    if (Array.isArray(j)) { remote = j.map((x: any) => ({ line: x.display_name.split(',').slice(0, 2).join(','), area: x.display_name.split(',').slice(2, 4).join(',').trim(), lat: Number(x.lat), lng: Number(x.lon), source: 'nominatim' as const })); db.geoPut(k, remote); }
  }
  const all = [...local, ...remote];
  if (near) all.sort((a, b) => haversineKm(a, near) - haversineKm(b, near));
  return all.slice(0, 8);
}
