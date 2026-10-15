import { useEffect, useRef, useState } from 'react';
import { GlobeControl, LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setRTLTextPlugin, setWorkerUrl } from 'maplibre-gl';
import { greatCirclePath } from '../geo.js';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre runs tile parsing in a web worker. Vite emits it as its own file;
// the single-file build (scripts/inline.mjs) embeds it and hands over a blob URL.
setWorkerUrl(window.__MEETING_POINT_WORKER_URL__ || workerUrl);

// OpenFreeMap: free vector tiles, no API key, no usage limits.
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const LINES_SOURCE = 'pull-lines';
const PROJECTION_KEY = 'meeting-point:projection';

function readProjection() {
  try {
    return localStorage.getItem(PROJECTION_KEY) === 'mercator' ? 'mercator' : 'globe';
  } catch {
    return 'globe';
  }
}

// Shapes Hebrew and Arabic map labels correctly. Loaded lazily, only when a
// label needs it.
setRTLTextPlugin('https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js', true);

function isDark() {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function pinElement(color, n, dim) {
  const el = document.createElement('div');
  el.className = `mp-pin${dim ? ' dim' : ''}`;
  el.innerHTML = `<span style="--c:${color}">${n}</span>`;
  return el;
}

function updatePin(el, color, n, dim) {
  // Toggle only our own class: MapLibre keeps its positioning classes on the same element.
  el.classList.toggle('dim', dim);
  const span = el.firstElementChild;
  span.style.setProperty('--c', color);
  span.textContent = String(n);
}

function midElement(color) {
  const el = document.createElement('div');
  el.className = 'mp-mid';
  el.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="ring" cx="22" cy="22" r="16" fill="none" stroke="${color}" stroke-width="3"/>
      <circle cx="22" cy="22" r="16" fill="${color}" fill-opacity="0.12"/>
      <path d="M22 2v9M22 33v9M2 22h9M33 22h9" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M22 2v9M22 33v9M2 22h9M33 22h9" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="22" cy="22" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>
    </svg>`;
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function popup(html) {
  return new Popup({ offset: 18, closeButton: false, maxWidth: '260px' }).setHTML(html);
}

/**
 * MapLibre map showing every visible group's addresses, each group's middle,
 * and (optionally) the middle of everyone. Address markers can be dragged;
 * `onMoveAddress(groupId, addressId, {lat,lng})` is called when that happens.
 */
export default function MapView({ groups, activeGroupId, everyone, pinMode, pinTarget, onPin, onExitPin, onMoveAddress, onSelectGroup }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const midsRef = useRef(new Map());
  const everyoneRef = useRef(null);
  const linesRef = useRef({ type: 'FeatureCollection', features: [] });
  const cbRef = useRef({ onMoveAddress, onSelectGroup, onPin, onExitPin });
  const contextPopupRef = useRef(null);
  const lastFitKey = useRef('');
  const [styleReady, setStyleReady] = useState(0);
  const [pinCount, setPinCount] = useState(0);
  cbRef.current = { onMoveAddress, onSelectGroup, onPin, onExitPin };

  // Create the map once.
  useEffect(() => {
    const map = new MapLibreMap({
      container: elRef.current,
      style: STYLES[isDark() ? 'dark' : 'light'],
      center: [35.0, 32.5],
      zoom: 6.5,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    // Globe at low zoom, flattening into a normal map as you zoom in; the
    // control lets people switch back to a flat map and the choice is kept.
    map.addControl(new GlobeControl(), 'top-left');
    map.on('projectiontransition', (e) => {
      const name = e.newProjection === 'mercator' ? 'mercator' : 'globe';
      try {
        localStorage.setItem(PROJECTION_KEY, name);
      } catch {
        /* fine without it */
      }
    });
    mapRef.current = map;

    // Each style load (first load and after a theme switch) needs the lines
    // source re-created, because setStyle drops custom sources and layers.
    map.on('style.load', () => {
      // setStyle resets the projection, so re-apply the chosen one each time.
      map.setProjection({ type: readProjection() });
      if (!map.getSource(LINES_SOURCE)) {
        map.addSource(LINES_SOURCE, { type: 'geojson', data: linesRef.current });
        map.addLayer({
          id: LINES_SOURCE,
          type: 'line',
          source: LINES_SOURCE,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 1.5,
            'line-opacity': 0.6,
            'line-dasharray': [2, 3],
          },
        });
      }
      setStyleReady((n) => n + 1);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const retheme = () => map.setStyle(STYLES[isDark() ? 'dark' : 'light']);
    mq.addEventListener('change', retheme);
    const obs = new MutationObserver(retheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(elRef.current);

    // Right-click (long-press on touch) anywhere: offer to add an address there.
    map.on('contextmenu', (e) => {
      e.preventDefault();
      contextPopupRef.current?.remove();
      const el = document.createElement('div');
      el.className = 'ctx-popup';
      const { lat, lng } = e.lngLat;
      el.innerHTML = `<span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span><button type="button" class="ctx-add"></button>`;
      const btn = el.querySelector('button');
      btn.textContent = `Add address here`;
      btn.addEventListener('click', () => {
        cbRef.current.onPin({ lat, lng });
        contextPopupRef.current?.remove();
      });
      contextPopupRef.current = new Popup({ offset: 6, closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(el).addTo(map);
    });

    return () => {
      mq.removeEventListener('change', retheme);
      obs.disconnect();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pin mode: crosshair cursor, each click adds an address, Esc leaves the mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pinMode) return undefined;
    setPinCount(0);
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    const onClick = (e) => {
      if (e.originalEvent?.target?.closest?.('.maplibregl-marker, .maplibregl-popup')) return;
      cbRef.current.onPin({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setPinCount((n) => n + 1);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cbRef.current.onExitPin();
    };
    map.on('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      map.off('click', onClick);
      window.removeEventListener('keydown', onKey);
      canvas.style.cursor = '';
    };
  }, [pinMode]);

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
        const html =
          `<strong dir="auto">${escapeHtml(a.label || `Address ${i + 1}`)}</strong><br><span dir="auto">${escapeHtml(a.address)}</span>` +
          `<br><span style="opacity:.7">Drag the marker to move it</span>`;
        let m = markers.get(key);
        if (!m) {
          const el = pinElement(g.color, i + 1, dim);
          el.title = `${a.label ? `${a.label} — ` : ''}${a.address}`;
          m = new Marker({ element: el, draggable: true, anchor: 'center' })
            .setLngLat([a.lng, a.lat])
            .setPopup(popup(html))
            .addTo(map);
          m.on('dragend', () => {
            const ll = m.getLngLat();
            cbRef.current.onMoveAddress(g.id, a.id, { lat: ll.lat, lng: ll.lng });
          });
          el.addEventListener('click', () => cbRef.current.onSelectGroup(g.id));
          markers.set(key, m);
        } else {
          const cur = m.getLngLat();
          if (Math.abs(cur.lat - a.lat) > 1e-9 || Math.abs(cur.lng - a.lng) > 1e-9) m.setLngLat([a.lng, a.lat]);
          updatePin(m.getElement(), g.color, i + 1, dim);
          m.getElement().title = `${a.label ? `${a.label} — ` : ''}${a.address}`;
          m.getPopup()?.setHTML(html);
        }
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
    const features = [];

    groups.forEach((g) => {
      if (!g.visible || !g.result) return;
      keep.add(g.id);
      const { lat, lng } = g.result;
      const html =
        `<strong>Middle of ${escapeHtml(g.name)}</strong><br>${g.result.address ? `<span dir="auto">${escapeHtml(g.result.address)}</span><br>` : ''}` +
        `<span style="opacity:.7">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>`;
      let m = mids.get(g.id);
      if (!m) {
        m = new Marker({ element: midElement(g.color), anchor: 'center' }).setLngLat([lng, lat]).setPopup(popup(html)).addTo(map);
        mids.set(g.id, m);
      } else {
        m.setLngLat([lng, lat]);
        const el = m.getElement();
        if (el.dataset.color !== g.color) {
          el.innerHTML = midElement(g.color).innerHTML;
          el.dataset.color = g.color;
        }
        m.getPopup()?.setHTML(html);
      }
      m.getElement().style.opacity = g.result.stale ? '0.45' : '1';
      if (g.id === activeGroupId && !g.result.stale) {
        g.addresses.forEach((a) => {
          if (a.weight === 0) return;
          features.push({
            type: 'Feature',
            properties: { color: g.color },
            geometry: {
              type: 'LineString',
              // The true shortest path curves on a flat map; drawing it straight
              // would make a correct middle look wrong on long distances.
              coordinates: greatCirclePath(a, { lat, lng }),
            },
          });
        });
      }
    });

    for (const [id, m] of mids) {
      if (!keep.has(id)) {
        m.remove();
        mids.delete(id);
      }
    }

    linesRef.current = { type: 'FeatureCollection', features };
    const src = map.getSource(LINES_SOURCE);
    if (src) src.setData(linesRef.current);
  }, [groups, activeGroupId, styleReady]);

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
      const html =
        `<strong>Middle of everyone</strong><br>${everyone.address ? `<span dir="auto">${escapeHtml(everyone.address)}</span><br>` : ''}` +
        `<span style="opacity:.7">${everyone.lat.toFixed(5)}, ${everyone.lng.toFixed(5)}</span>`;
      everyoneRef.current = new Marker({ element: midElement(color), anchor: 'center' })
        .setLngLat([everyone.lng, everyone.lat])
        .setPopup(popup(html))
        .addTo(map);
    }
  }, [everyone, styleReady]);

  // Fit the view when the set of points changes (not on every drag or rename).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [];
    groups.forEach((g) => {
      if (!g.visible) return;
      g.addresses.forEach((a) => pts.push([a.lng, a.lat]));
      if (g.result && !g.result.stale) pts.push([g.result.lng, g.result.lat]);
    });
    if (everyone) pts.push([everyone.lng, everyone.lat]);
    const key = `${pts.length}|${groups
      .filter((g) => g.visible)
      .map((g) => `${g.id}:${g.addresses.length}:${g.result && !g.result.stale ? 'r' : ''}`)
      .join(',')}|${everyone ? 'e' : ''}`;
    if (key === lastFitKey.current) return;
    lastFitKey.current = key;
    if (pts.length === 0 || pinMode) return; // don't yank the map around while someone is placing pins
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 13) });
      return;
    }
    const bounds = pts.reduce((b, p) => b.extend(p), new LngLatBounds(pts[0], pts[0]));
    map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 600 });
  }, [groups, everyone, pinMode]);

  return (
    <div className="map-wrap">
      <div className="map" ref={elRef} role="region" aria-label="Map" />
      {pinMode && (
        <div className="pin-banner" role="status" style={{ '--c': pinTarget?.color }}>
          <span className="dot" />
          <span>
            {pinCount === 0
              ? `Click the map to add an address to ${pinTarget?.name ?? 'this group'}`
              : `Added ${pinCount} · click again for more`}
          </span>
          <button type="button" onClick={() => cbRef.current.onExitPin()}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
