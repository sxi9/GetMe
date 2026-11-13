import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng, TrafficLevel, Vehicle } from '@getme/core';

export interface MapProps {
  center?: LatLng;
  a?: LatLng | null; aIcon?: string;      // origin pin (shop / pickup) – navy
  b?: LatLng | null; bIcon?: string;      // destination pin (home / receiver) – red
  courier?: LatLng | null;                // moving partner
  courierHeading?: number | null;         // degrees from north: rotates the vehicle
  courierVehicle?: Vehicle | string | null; // Bike / Scooter / Cycle → icon
  courierTrail?: LatLng[];                // recent fixes → fading tail
  courierLabel?: string | null;           // e.g. "Ravi · 18 km/h"
  me?: LatLng | null;                     // partner's own position (partner app)
  meHeading?: number | null; meVehicle?: Vehicle | string | null;
  pool?: LatLng[];                        // other partners / shops
  route?: LatLng[] | null;                // dashed route polyline
  eta?: string | null;
  traffic?: TrafficLevel | null;          // colours the ETA pill and the route
  tall?: boolean;
  interactive?: boolean;
  follow?: boolean;                       // keep the courier in view as it moves
}
const VEHICLE_ICON: Record<string, string> = { Bike: 'two_wheeler', Scooter: 'moped', Cycle: 'pedal_bike' };
const TRAFFIC_COLOR: Record<TrafficLevel, string> = { light: '#0F9135', moderate: '#F27700', heavy: '#A51E23' };
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const div = (cls: string, inner = '', size = 22) => L.divIcon({ className: '', html: `<div class="${esc(cls)}">${esc(inner)}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const vehicleIcon = (vehicle: string | null | undefined, heading: number | null | undefined, label?: string | null) => L.divIcon({
  className: 'vehicle-marker',
  html: `<div class="vehicle"><div class="ring"></div><div class="arrow" style="transform:rotate(${Number(heading) || 0}deg)"><span class="gm-icon tip is-filled">navigation</span></div><div class="body"><span class="gm-icon">${esc(VEHICLE_ICON[vehicle ?? ''] ?? 'two_wheeler')}</span></div>${label ? `<div class="lbl">${esc(label)}</div>` : ''}</div>`,
  iconSize: [44, 44], iconAnchor: [22, 22],
});

/** Leaflet + OpenStreetMap tiles. No API key needed; swap the tile URL for Google/Mapbox in production. */
export function Map({ center, a, aIcon = 'storefront', b, bIcon = 'home', courier, courierHeading, courierVehicle, courierTrail = [], courierLabel, me, meHeading, meVehicle, pool = [], route, eta, traffic, tall, interactive = true, follow = true }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ a?: L.Marker; b?: L.Marker; courier?: L.Marker; me?: L.Marker; pool: L.Marker[]; route?: L.Polyline; trail?: L.Polyline }>({ pool: [] });
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
    const vehicle = (k: 'courier' | 'me', pos: LatLng | null | undefined, heading: number | null | undefined, veh: string | null | undefined, label?: string | null) => {
      if (!pos) { ly[k]?.remove(); ly[k] = undefined; return; }
      const icon = vehicleIcon(veh, heading, label);
      if (!ly[k]) ly[k] = L.marker([pos.lat, pos.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(m);
      else { ly[k]!.setLatLng([pos.lat, pos.lng]); ly[k]!.setIcon(icon); }
    };
    vehicle('courier', courier, courierHeading, courierVehicle, courierLabel); vehicle('me', me, meHeading, meVehicle);
    ly.pool.forEach(p => p.remove()); ly.pool = pool.map(p => L.marker([p.lat, p.lng], { icon: div('dot-pool', '', 12), interactive: false }).addTo(m));
    const routeColor = traffic ? TRAFFIC_COLOR[traffic] : '#0072CE';
    if (route && route.length > 1) { const ll = route.map(p => [p.lat, p.lng] as [number, number]); if (!ly.route) ly.route = L.polyline(ll, { color: routeColor, weight: 4, dashArray: '1 8', lineCap: 'round' }).addTo(m); else { ly.route.setLatLngs(ll); ly.route.setStyle({ color: routeColor }); } }
    else { ly.route?.remove(); ly.route = undefined; }
    const tail = courier && courierTrail.length > 1 ? [...courierTrail, courier].map(p => [p.lat, p.lng] as [number, number]) : null;
    if (tail) { if (!ly.trail) ly.trail = L.polyline(tail, { color: '#0072CE', weight: 5, opacity: 0.35, lineCap: 'round', className: 'trail' }).addTo(m); else ly.trail.setLatLngs(tail); }
    else { ly.trail?.remove(); ly.trail = undefined; }
    const pts = [a, b, me, ...(fitted.current ? [] : [courier]), ...pool].filter(Boolean) as LatLng[];
    if (pts.length && !fitted.current) { fitted.current = true; if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15); else m.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [28, 28], maxZoom: 16, animate: false }); }
    else if (!pts.length && center) m.setView([center.lat, center.lng], 15);
    else if (follow && courier && fitted.current && !m.getBounds().pad(-0.15).contains([courier.lat, courier.lng])) m.panTo([courier.lat, courier.lng], { animate: true, duration: 0.6 });
    const t = setTimeout(() => { if (map.current === m) m.invalidateSize(); }, 50);
    return () => clearTimeout(t);
  }, [a, b, courier, courierHeading, courierVehicle, courierTrail, courierLabel, me, meHeading, meVehicle, pool, route, aIcon, bIcon, center, traffic, follow]);

  return (
    <div className={'map' + (tall ? ' tall' : '')}>
      <div ref={el} style={{ width: '100%', height: '100%' }} />
      {eta && <div className={'eta' + (traffic ? ' traffic-' + traffic : '')}><span className="gm-icon" style={{ fontSize: 14 }}>{traffic === 'heavy' ? 'traffic' : traffic === 'moderate' ? 'schedule' : 'bolt'}</span>{eta}{traffic && <span className="tl">{traffic === 'heavy' ? 'heavy traffic' : traffic === 'moderate' ? 'moderate traffic' : 'light traffic'}</span>}</div>}
    </div>
  );
}
