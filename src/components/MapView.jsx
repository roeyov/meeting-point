import { useEffect, useRef } from 'react';
import L from 'leaflet';

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
};
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function isDark() {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function pinIcon(color, n, dim) {
  return L.divIcon({
    className: `mp-pin${dim ? ' dim' : ''}`,
    html: `<span style="--c:${color}">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function midIcon(color) {
  return L.divIcon({
    className: 'mp-mid',
    html: `<svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="ring" cx="22" cy="22" r="16" fill="none" stroke="${color}" stroke-width="3"/>
      <circle cx="22" cy="22" r="16" fill="${color}" fill-opacity="0.12"/>
      <path d="M22 2v9M22 33v9M2 22h9M33 22h9" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M22 2v9M22 33v9M2 22h9M33 22h9" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="22" cy="22" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>
    </svg>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * Leaflet map showing every visible group's addresses, each group's middle,
 * and (optionally) the middle of everyone. Address markers can be dragged;
 * `onMoveAddress(groupId, addressId, {lat,lng})` is called when that happens.
 */
export default function MapView({ groups, activeGroupId, everyone, onMoveAddress, onSelectGroup }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const tilesRef = useRef(null);
  const markersRef = useRef(new Map());
  const midsRef = useRef(new Map());
  const linesRef = useRef(null);
  const everyoneRef = useRef(null);
  const cbRef = useRef({ onMoveAddress, onSelectGroup });
  const lastFitKey = useRef('');
  cbRef.current = { onMoveAddress, onSelectGroup };

  // Create the map once.
  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: true, worldCopyJump: true }).setView([32.5, 35.0], 7);
    tilesRef.current = L.tileLayer(TILES[isDark() ? 'dark' : 'light'], {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: ATTRIBUTION,
    }).addTo(map);
    linesRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const retheme = () => tilesRef.current.setUrl(TILES[isDark() ? 'dark' : 'light']);
    mq.addEventListener('change', retheme);
    const obs = new MutationObserver(retheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);

    return () => {
      mq.removeEventListener('change', retheme);
      obs.disconnect();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync address markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const keep = new Set();

    groups.forEach((g) => {
      if (!g.visible) return;
      g.addresses.forEach((a, i) => {
        const key = `${g.id}:${a.id}`;
        keep.add(key);
        const dim = g.id !== activeGroupId || a.weight === 0;
        const icon = pinIcon(g.color, i + 1, dim);
        const title = `${a.label ? `${a.label} — ` : ''}${a.address}`;
        let m = markers.get(key);
        if (!m) {
          m = L.marker([a.lat, a.lng], { icon, draggable: true, title, riseOnHover: true });
          m.on('dragend', (e) => {
            const ll = e.target.getLatLng();
            cbRef.current.onMoveAddress(g.id, a.id, { lat: ll.lat, lng: ll.lng });
          });
          m.on('click', () => cbRef.current.onSelectGroup(g.id));
          m.bindPopup('');
          m.addTo(map);
          markers.set(key, m);
        } else {
          const cur = m.getLatLng();
          if (Math.abs(cur.lat - a.lat) > 1e-9 || Math.abs(cur.lng - a.lng) > 1e-9) m.setLatLng([a.lat, a.lng]);
          m.setIcon(icon);
          m.options.title = title;
        }
        m.setPopupContent(
          `<strong dir="auto">${escapeHtml(a.label || `Address ${i + 1}`)}</strong><br><span dir="auto">${escapeHtml(a.address)}</span>` +
            `<br><span style="opacity:.7">Drag the marker to move it</span>`,
        );
      });
    });

    for (const [key, m] of markers) {
      if (!keep.has(key)) {
        m.remove();
        markers.delete(key);
      }
    }
  }, [groups, activeGroupId]);

  // Sync middle markers and the lines from each address to its group's middle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mids = midsRef.current;
    const keep = new Set();
    linesRef.current.clearLayers();

    groups.forEach((g) => {
      if (!g.visible || !g.result) return;
      keep.add(g.id);
      const { lat, lng } = g.result;
      let m = mids.get(g.id);
      if (!m) {
        m = L.marker([lat, lng], { icon: midIcon(g.color), zIndexOffset: 1000, keyboard: false });
        m.addTo(map);
        mids.set(g.id, m);
      } else {
        m.setLatLng([lat, lng]);
        m.setIcon(midIcon(g.color));
      }
      m.setOpacity(g.result.stale ? 0.45 : 1);
      m.bindPopup(
        `<strong>Middle of ${escapeHtml(g.name)}</strong><br>${g.result.address ? `<span dir="auto">${escapeHtml(g.result.address)}</span><br>` : ''}` +
          `<span style="opacity:.7">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>`,
      );
      if (g.id === activeGroupId && !g.result.stale) {
        g.addresses.forEach((a) => {
          if (a.weight === 0) return;
          L.polyline(
            [
              [a.lat, a.lng],
              [lat, lng],
            ],
            { color: g.color, weight: 1.5, opacity: 0.55, dashArray: '4 6', interactive: false },
          ).addTo(linesRef.current);
        });
      }
    });

    for (const [id, m] of mids) {
      if (!keep.has(id)) {
        m.remove();
        mids.delete(id);
      }
    }
  }, [groups, activeGroupId]);

  // "Everyone" marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (everyoneRef.current) {
      everyoneRef.current.remove();
      everyoneRef.current = null;
    }
    if (everyone) {
      const color = isDark() ? '#ffffff' : '#14202b';
      const m = L.marker([everyone.lat, everyone.lng], { icon: midIcon(color), zIndexOffset: 2000, keyboard: false }).addTo(map);
      m.bindPopup(
        `<strong>Middle of everyone</strong><br>${everyone.address ? `<span dir="auto">${escapeHtml(everyone.address)}</span><br>` : ''}` +
          `<span style="opacity:.7">${everyone.lat.toFixed(5)}, ${everyone.lng.toFixed(5)}</span>`,
      );
      everyoneRef.current = m;
    }
  }, [everyone]);

  // Fit the view when the set of points changes (not on every drag or rename).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [];
    groups.forEach((g) => {
      if (!g.visible) return;
      g.addresses.forEach((a) => pts.push([a.lat, a.lng]));
      if (g.result && !g.result.stale) pts.push([g.result.lat, g.result.lng]);
    });
    if (everyone) pts.push([everyone.lat, everyone.lng]);
    const key = `${pts.length}|${groups
      .filter((g) => g.visible)
      .map((g) => `${g.id}:${g.addresses.length}:${g.result && !g.result.stale ? 'r' : ''}`)
      .join(',')}|${everyone ? 'e' : ''}`;
    if (key === lastFitKey.current) return;
    lastFitKey.current = key;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], Math.max(map.getZoom(), 13), { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15, animate: true });
  }, [groups, everyone]);

  return <div className="map" ref={elRef} role="region" aria-label="Map" />;
}
