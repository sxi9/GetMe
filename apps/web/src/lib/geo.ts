// Device location → readable address. Uses the browser GPS, then the API's
// reverse geocoder (OpenStreetMap with a local fallback). Everything degrades:
// no GPS → null, and the caller falls back to the saved address or a pin.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address, LatLng, RegionProfile } from '@getme/core';
import { api } from './api';
import { isNative, nativeGetPosition, nativeWatchPosition, APP_TARGET } from './native';

export type GpsState = 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable';
export interface GeoHit { line: string; area: string; lat: number; lng: number; source: string; region?: RegionProfile }

export function hasGeolocation() { return typeof navigator !== 'undefined' && 'geolocation' in navigator; }

/** One-shot position with a timeout; resolves null instead of throwing. */
export function getPosition(opts: PositionOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }): Promise<{ pos: LatLng; accuracyM: number } | { error: 'denied' | 'unavailable' }> {
  if (isNative()) return nativeGetPosition();
  if (!hasGeolocation()) return Promise.resolve({ error: 'unavailable' });
  return new Promise(res => {
    navigator.geolocation.getCurrentPosition(
      p => res({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracyM: Math.round(p.coords.accuracy) }),
      e => res({ error: e.code === 1 ? 'denied' : 'unavailable' }),
      opts,
    );
  });
}
export const reverseGeocode = (pos: LatLng) => api<GeoHit>(`/api/geo/reverse?lat=${pos.lat}&lng=${pos.lng}`);
export const searchPlaces = (q: string, near?: LatLng | null) => api<GeoHit[]>(`/api/geo/search?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ''}`);
export const regionAt = (pos: LatLng) => api<RegionProfile>(`/api/geo/region?lat=${pos.lat}&lng=${pos.lng}`);

/** Address object for "where I am right now". */
export async function currentLocationAddress(): Promise<{ address: Address; region?: RegionProfile } | { error: GpsState }> {
  const r = await getPosition();
  if ('error' in r) return { error: r.error };
  let hit: GeoHit | null = null;
  try { hit = await reverseGeocode(r.pos); } catch { /* offline: keep coordinates */ }
  const address: Address = { label: 'Current location', line: hit?.line ?? `${r.pos.lat.toFixed(5)}, ${r.pos.lng.toFixed(5)}`, area: hit?.area, lat: r.pos.lat, lng: r.pos.lng, source: 'gps', accuracyM: r.accuracyM, handoff: 'in_person' };
  return { address, region: hit?.region };
}

/** Hook: detect once on mount (if `auto`), expose state + a manual retry. */
export function useCurrentLocation(auto = true) {
  const [state, setState] = useState<GpsState>('idle');
  const [result, setResult] = useState<{ address: Address; region?: RegionProfile } | null>(null);
  const busy = useRef(false);
  const locate = useCallback(async () => {
    if (busy.current) return; busy.current = true; setState('asking');
    const r = await currentLocationAddress();
    if ('error' in r) setState(r.error); else { setResult(r); setState('ok'); }
    busy.current = false;
  }, []);
  useEffect(() => { if (auto) void locate(); }, [auto, locate]);
  return { state, result, locate };
}

/** Continuous watch for the partner app. Calls `onPos` at most every `throttleMs`. */
export function watchPosition(onPos: (p: LatLng, accuracyM: number) => void, onState: (s: GpsState) => void, throttleMs = 4000): () => void {
  if (isNative()) {
    // native shell: background watcher in the partner app so the customer keeps seeing the vehicle with the screen off
    let last = 0, stop: (() => void) | null = null, cancelled = false;
    nativeWatchPosition((p, acc) => { onState('ok'); const t = Date.now(); if (t - last >= throttleMs) { last = t; onPos(p, acc); } }, s => onState(s), { background: APP_TARGET === 'partner' }).then(s => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }
  if (!hasGeolocation()) { onState('unavailable'); return () => {}; }
  let last = 0;
  const id = navigator.geolocation.watchPosition(
    p => { onState('ok'); const t = Date.now(); if (t - last >= throttleMs) { last = t; onPos({ lat: p.coords.latitude, lng: p.coords.longitude }, Math.round(p.coords.accuracy)); } },
    e => onState(e.code === 1 ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export const fmtAddress = (a: Partial<Address> | null | undefined) => {
  if (!a) return '';
  const unit = [a.flat, a.tower && `Tower ${a.tower}`, a.floor].filter(Boolean).join(', ');
  return [unit, a.building, a.line, a.landmark && `near ${a.landmark}`].filter(Boolean).join(' · ');
};
