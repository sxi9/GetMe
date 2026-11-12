// Drop-a-pin address picker: the map pans under a fixed crosshair; the centre
// is the chosen point. Reverse-geocodes on settle and offers a "use my
// location" button. Works without GPS (pan to the place).
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { LatLng } from '@getme/core';
import { getPosition, reverseGeocode, type GeoHit } from '../lib/geo';
import { Icon } from './Icon';
import { Button } from './Button';

export function MapPicker({ value, onChange, height = 260 }: { value: LatLng | null; onChange: (pos: LatLng, hit: GeoHit | null, accuracyM?: number) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const acc = useRef<L.Circle | null>(null);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<'idle' | 'asking' | 'denied' | 'unavailable' | 'ok'>('idle');
  const settle = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(m);
    m.setView([value?.lat ?? 12.9121, value?.lng ?? 77.6446], value ? 17 : 14);
    m.on('moveend', () => {
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(async () => { const c = m.getCenter(); const pos = { lat: c.lat, lng: c.lng }; setBusy(true); let hit: GeoHit | null = null; try { hit = await reverseGeocode(pos); } catch { /* offline */ } setBusy(false); onChangeRef.current(pos, hit); }, 450);
    });
    map.current = m;
    setTimeout(() => m.invalidateSize(), 60);
    return () => { window.clearTimeout(settle.current); m.remove(); map.current = null; acc.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = async () => {
    setGps('asking');
    const r = await getPosition();
    if ('error' in r) { setGps(r.error); return; }
    setGps('ok');
    const m = map.current; if (!m) return;
    acc.current?.remove(); acc.current = L.circle([r.pos.lat, r.pos.lng], { radius: Math.max(r.accuracyM, 10), color: '#0072CE', weight: 1, fillOpacity: 0.12 }).addTo(m);
    m.setView([r.pos.lat, r.pos.lng], 17); // moveend → reverse geocode → onChange
    onChangeRef.current(r.pos, null, r.accuracyM);
  };
  useEffect(() => { if (!value && gps === 'idle') void locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-picker map" style={{ height }}>
      <div ref={el} style={{ width: '100%', height: '100%' }} />
      <span className="vulpes-icon crosshair is-filled" aria-hidden="true">location_on</span>
      <div className="locate"><Button variant="protected" size="small" icon="my_location" onClick={locate} loading={gps === 'asking'}>{gps === 'denied' ? 'Location blocked' : gps === 'unavailable' ? 'No GPS' : 'My location'}</Button></div>
      {busy && <div className="eta" style={{ left: 'auto', right: 12, bottom: 'auto', top: 12 }}><Icon name="progress_activity" size={14} /> Finding the place…</div>}
    </div>
  );
}
