// Leaflet map of nearby shops with tappable pins (the shared Map keeps its markers inert).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '@getme/core';

export function ShopsMap({ shops, home, onPick, height = 240 }: { shops: any[]; home: LatLng | null; onPick: (id: string) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const layer = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(m);
    m.setView([home?.lat ?? 12.9121, home?.lng ?? 77.6446], 14);
    layer.current = L.layerGroup().addTo(m); map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 60);
    return () => { clearTimeout(t); m.remove(); map.current = null; layer.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current, g = layer.current; if (!m || !g) return;
    g.clearLayers();
    if (home) L.marker([home.lat, home.lng], { icon: L.divIcon({ className: '', html: '<div class="pin b">home</div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false }).addTo(g);
    const pts: [number, number][] = home ? [[home.lat, home.lng]] : [];
    for (const s of shops) {
      const open = s.open ? '' : 'opacity:.55;';
      const html = `<div style="display:flex;flex-direction:column;align-items:center;${open}"><div class="pin a" style="width:26px;height:26px;font-size:15px">storefront</div><div style="margin-top:2px;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:1px 6px;font:600 10px/14px var(--font-sans);white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.2)">${s.name.replace(/</g, '')}</div></div>`;
      L.marker([s.pos.lat, s.pos.lng], { icon: L.divIcon({ className: '', html, iconSize: [120, 44], iconAnchor: [60, 13] }) }).on('click', () => pickRef.current(s.id)).addTo(g);
      pts.push([s.pos.lat, s.pos.lng]);
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15, animate: false }); else if (pts.length === 1) m.setView(pts[0], 14);
  }, [shops, home]);
  return <div className="map" style={{ height }}><div ref={el} style={{ width: '100%', height: '100%' }} /></div>;
}
