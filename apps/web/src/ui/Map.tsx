import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '@getme/core';

export interface MapProps {
  center?: LatLng;
  a?: LatLng | null; aIcon?: string;      // origin pin (shop / pickup) – navy
  b?: LatLng | null; bIcon?: string;      // destination pin (home / receiver) – red
  courier?: LatLng | null;                // moving partner dot
  me?: LatLng | null;                     // partner's own position (partner app)
  pool?: LatLng[];                        // other partners (choose screen)
  route?: LatLng[] | null;                // dashed route polyline
  eta?: string | null;
  tall?: boolean;
  interactive?: boolean;
}
const div = (cls: string, inner = '', size = 22) => L.divIcon({ className: '', html: `<div class="${cls}">${inner}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

/** Leaflet + OpenStreetMap tiles. No API key needed; swap the tile URL for Google/Mapbox in production. */
export function Map({ center, a, aIcon = 'storefront', b, bIcon = 'home', courier, me, pool = [], route, eta, tall, interactive = true }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ a?: L.Marker; b?: L.Marker; courier?: L.Marker; me?: L.Marker; pool: L.Marker[]; route?: L.Polyline }>({ pool: [] });
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, dragging: interactive, scrollWheelZoom: false, touchZoom: interactive, doubleClickZoom: interactive });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(m);
    m.setView([center?.lat ?? 12.9121, center?.lng ?? 77.6446], 15);
    map.current = m;
    return () => { m.remove(); map.current = null; layers.current = { pool: [] }; fitted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    m.stop();
    const ly = layers.current;
    const pin = (k: 'a' | 'b', pos: LatLng | null | undefined, cls: string, icon: string) => {
      if (!pos) { ly[k]?.remove(); ly[k] = undefined; return; }
      if (!ly[k]) ly[k] = L.marker([pos.lat, pos.lng], { icon: div('pin ' + cls, icon), interactive: false }).addTo(m);
      else { ly[k]!.setLatLng([pos.lat, pos.lng]); ly[k]!.setIcon(div('pin ' + cls, icon)); }
    };
    pin('a', a, 'a', aIcon); pin('b', b, 'b', bIcon);
    const dot = (k: 'courier' | 'me', pos: LatLng | null | undefined, cls: string, size: number) => {
      if (!pos) { ly[k]?.remove(); ly[k] = undefined; return; }
      if (!ly[k]) ly[k] = L.marker([pos.lat, pos.lng], { icon: div(cls, '', size), interactive: false, zIndexOffset: 1000 }).addTo(m);
      else ly[k]!.setLatLng([pos.lat, pos.lng]);
    };
    dot('courier', courier, 'dot-me', 14); dot('me', me, 'dot-me', 14);
    ly.pool.forEach(p => p.remove()); ly.pool = pool.map(p => L.marker([p.lat, p.lng], { icon: div('dot-pool', '', 12), interactive: false }).addTo(m));
    if (route && route.length > 1) { const ll = route.map(p => [p.lat, p.lng] as [number, number]); if (!ly.route) ly.route = L.polyline(ll, { color: '#0072CE', weight: 4, dashArray: '1 8', lineCap: 'round' }).addTo(m); else ly.route.setLatLngs(ll); }
    else { ly.route?.remove(); ly.route = undefined; }
    const pts = [a, b, me, ...(fitted.current ? [] : [courier]), ...pool].filter(Boolean) as LatLng[];
    if (pts.length && !fitted.current) { fitted.current = true; if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15); else m.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [28, 28], maxZoom: 16, animate: false }); }
    else if (!pts.length && center) m.setView([center.lat, center.lng], 15);
    const t = setTimeout(() => { if (map.current === m) m.invalidateSize(); }, 50);
    return () => clearTimeout(t);
  }, [a, b, courier, me, pool, route, aIcon, bIcon, center]);

  return <div className={'map' + (tall ? ' tall' : '')}><div ref={el} style={{ width: '100%', height: '100%' }} />{eta && <div className="eta">{eta}</div>}</div>;
}
