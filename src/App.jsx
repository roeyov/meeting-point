import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AddressSearch from './components/AddressSearch.jsx';
import AddressRow from './components/AddressRow.jsx';
import MapView from './components/MapView.jsx';
import PasteDialog from './components/PasteDialog.jsx';
import { METHODS, computeMiddle, distanceKm, formatCoord } from './geo.js';
import { reverse } from './geocode.js';
import { GROUP_COLORS, encodeShare, loadState, reducer, saveState, uid } from './state.js';
import { Copy, Eye, Logo, Moon, Sun, Target, Trash } from './icons.jsx';
import { applyTheme, effectiveTheme, readTheme } from './theme.js';

function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  const [effective, setEffective] = useState(() => effectiveTheme(theme));
  useEffect(() => {
    applyTheme(theme);
    setEffective(effectiveTheme(theme));
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setEffective(effectiveTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  const toggle = () => setTheme(effective === 'dark' ? 'light' : 'dark');
  return [effective, toggle];
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(0);
  const show = useCallback((text) => {
    setMsg(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2400);
  }, []);
  return [msg, show];
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [locating, setLocating] = useState(false);
  const [toast, showToast] = useToast();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => saveState(state), [state]);

  const group = state.groups.find((g) => g.id === state.activeGroupId) ?? state.groups[0];
  const usable = group.addresses.filter((a) => a.weight > 0);
  const canCalc = usable.length >= 2;
  const bias = group.addresses.length ? group.addresses[group.addresses.length - 1] : null;

  const distances = useMemo(() => {
    if (!group.result || group.result.stale) return null;
    const m = new Map();
    group.addresses.forEach((a) => m.set(a.id, distanceKm(a, group.result)));
    return m;
  }, [group]);
  const maxKm = distances ? Math.max(0, ...group.addresses.filter((a) => a.weight > 0).map((a) => distances.get(a.id))) : 0;

  /** Add an address from bare coordinates, then fill in the nearest street address. */
  async function addPoint(lat, lng, label = '') {
    const id = uid();
    const groupId = group.id;
    dispatch({ type: 'address/add', groupId, id, label, place: { address: `${formatCoord(lat)}, ${formatCoord(lng)}`, lat, lng } });
    try {
      const place = await reverse(lat, lng);
      if (place) dispatch({ type: 'address/update', groupId, id, patch: { address: place.address } });
    } catch {
      /* coordinates stay as the address */
    }
  }

  async function resolveAddress(result, onAddress) {
    try {
      const place = await reverse(result.lat, result.lng);
      onAddress(place ? place.address : 'No street address nearby (open water or wilderness)');
    } catch {
      onAddress('Address lookup unavailable');
    }
  }

  function calculate() {
    const result = computeMiddle(state.method, group.addresses);
    if (!result) {
      showToast('These addresses surround the globe evenly; there is no single middle.');
      return;
    }
    const gid = group.id;
    dispatch({ type: 'result/set', groupId: gid, result: { ...result, method: state.method, address: null, stale: false } });
    resolveAddress(result, (address) => dispatch({ type: 'result/address', groupId: gid, address }));
  }

  function calculateEveryone() {
    const all = state.groups.filter((g) => g.visible).flatMap((g) => g.addresses);
    const result = computeMiddle(state.method, all);
    if (!result) {
      showToast('Not enough addresses across the visible groups.');
      return;
    }
    dispatch({ type: 'everyone/set', result: { ...result, address: null } });
    resolveAddress(result, (address) => dispatch({ type: 'everyone/set', result: { ...result, address } }));
  }

  function addMyLocation() {
    if (!navigator.geolocation) {
      showToast('This browser can’t share your location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        let address = `${formatCoord(lat)}, ${formatCoord(lng)}`;
        try {
          const place = await reverse(lat, lng);
          if (place) address = place.address;
        } catch {
          /* keep coordinates */
        }
        dispatch({ type: 'address/add', groupId: group.id, label: 'Me', place: { address, lat, lng } });
        setLocating(false);
      },
      () => {
        setLocating(false);
        showToast('Location permission was denied.');
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function shareLink() {
    const url = `${window.location.origin}${window.location.pathname}${encodeShare(state)}`;
    window.history.replaceState(null, '', url);
    showToast((await copyText(url)) ? 'Link copied. Anyone who opens it gets these groups.' : 'Link is in the address bar.');
  }

  const totalVisible = state.groups.filter((g) => g.visible).reduce((n, g) => n + g.addresses.filter((a) => a.weight > 0).length, 0);
  const methodInfo = METHODS[state.method];
  const res = group.result;

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <Logo />
          <h1>Meeting Point</h1>
          <span className="spacer" />
          <button type="button" className="link-btn" onClick={shareLink} title="Copy a link that contains all groups">
            Share link
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </header>

        <div className="tabs" role="tablist" aria-label="Groups">
          {state.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={g.id === group.id}
              style={{ '--c': g.color }}
              onClick={() => {
                setPinMode(false);
                dispatch({ type: 'group/select', id: g.id });
              }}
            >
              <span className="dot" />
              <span className="name" dir="auto">
                {g.name}
              </span>
              <span className="count">{g.addresses.length}</span>
            </button>
          ))}
          <button type="button" className="tab add" onClick={() => dispatch({ type: 'group/add' })}>
            + New group
          </button>
        </div>

        <div className="panel-scroll">
          <div className="group-head">
            <input
              className="group-name"
              type="text"
              dir="auto"
              value={group.name}
              aria-label="Group name"
              onChange={(e) => dispatch({ type: 'group/rename', id: group.id, name: e.target.value })}
            />
            <span className="swatches" role="radiogroup" aria-label="Group colour">
              {GROUP_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  style={{ '--c': c }}
                  aria-pressed={group.color === c}
                  aria-label={`Colour ${c}`}
                  onClick={() => dispatch({ type: 'group/color', id: group.id, color: c })}
                />
              ))}
            </span>
            <button
              type="button"
              className="icon-btn"
              title={group.visible ? 'Hide this group on the map' : 'Show this group on the map'}
              aria-pressed={!group.visible}
              onClick={() => dispatch({ type: 'group/toggle', id: group.id })}
            >
              <Eye off={!group.visible} />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              title={state.groups.length > 1 ? 'Delete this group' : 'Clear this group'}
              onClick={() => dispatch({ type: 'group/remove', id: group.id })}
            >
              <Trash />
            </button>
          </div>

          <AddressSearch
            key={group.id}
            bias={bias}
            placeholder={group.addresses.length ? 'Add another address' : 'Type an address, place or city'}
            onPick={(place) => dispatch({ type: 'address/add', groupId: group.id, place })}
          />
          <div className="search-tools">
            <button type="button" className="link-btn" onClick={addMyLocation} disabled={locating}>
              {locating ? 'Finding you…' : 'Use my location'}
            </button>
            <button type="button" className={`link-btn${pinMode ? ' active' : ''}`} onClick={() => setPinMode((v) => !v)} aria-pressed={pinMode}>
              {pinMode ? 'Stop pinning' : 'Pin on map'}
            </button>
            <button type="button" className="link-btn" onClick={() => setPasteOpen(true)}>
              Paste a list
            </button>
            {group.addresses.length > 0 && (
              <button type="button" className="link-btn" onClick={() => dispatch({ type: 'group/clear', id: group.id })}>
                Clear all
              </button>
            )}
          </div>

          {group.addresses.length === 0 ? (
            <div className="empty-state">
              <strong>No addresses yet</strong>
              Search above, pin a spot on the map, or right-click the map. You need at least two to find the middle.
            </div>
          ) : (
            <ul className="addresses">
              {group.addresses.map((a, i) => (
                <AddressRow
                  key={a.id}
                  index={i}
                  address={a}
                  color={group.color}
                  distanceKm={distances?.get(a.id) ?? null}
                  maxKm={maxKm}
                  onChange={(patch) => dispatch({ type: 'address/update', groupId: group.id, id: a.id, patch })}
                  onRemove={() => dispatch({ type: 'address/remove', groupId: group.id, id: a.id })}
                />
              ))}
            </ul>
          )}

          <div className="compute">
            <div className="method">
              <label htmlFor="method">What counts as the middle</label>
              <select id="method" value={state.method} onChange={(e) => dispatch({ type: 'method/set', method: e.target.value })}>
                {Object.entries(METHODS).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="hint">{methodInfo.hint}</span>
            </div>
            <button type="button" className="primary-btn" onClick={calculate} disabled={!canCalc}>
              <Target />
              {res && !res.stale ? 'Recalculate middle' : 'Calculate middle'}
            </button>
            {!canCalc && group.addresses.length > 0 && <span className="note">Add one more address (with weight above 0) to calculate.</span>}
          </div>

          {res && (
            <section className="result" style={{ '--c': group.color }} aria-live="polite">
              <div className="result-title">
                <Target />
                <span>
                  Middle of {group.name} · {METHODS[res.method]?.label ?? 'Average'}
                </span>
                {res.stale && <span className="stale">Changed since — recalculate</span>}
              </div>
              <div className={`result-place${res.address ? '' : ' pending'}`} dir="auto">
                {res.address ?? 'Looking up the nearest address…'}
              </div>
              <div className="coords">
                <code>
                  {formatCoord(res.lat)}, {formatCoord(res.lng)}
                </code>
                <button
                  type="button"
                  className="icon-btn"
                  title="Copy coordinates"
                  aria-label="Copy coordinates"
                  onClick={async () => showToast((await copyText(`${formatCoord(res.lat)}, ${formatCoord(res.lng)}`)) ? 'Coordinates copied' : 'Could not copy')}
                >
                  <Copy />
                </button>
              </div>
              {res.spread > 0.1 && (
                <span className="note warn">
                  These addresses span a large part of the globe. The average leans toward wherever most people are; pick “Shortest longest trip”
                  for the point that is equally far from everyone.
                </span>
              )}
              <div className="result-links">
                <a href={`https://www.google.com/maps?q=${res.lat},${res.lng}`} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                </a>
                <a href={`https://www.openstreetmap.org/?mlat=${res.lat}&mlon=${res.lng}#map=14/${res.lat}/${res.lng}`} target="_blank" rel="noopener noreferrer">
                  Open in OpenStreetMap
                </a>
                <a
                  href={`https://www.google.com/maps/search/restaurants/@${res.lat},${res.lng},15z`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Restaurants near here
                </a>
              </div>
            </section>
          )}

          {state.groups.length > 1 && (
            <div className="compute">
              <button type="button" className="secondary-btn" onClick={calculateEveryone} disabled={totalVisible < 2}>
                Middle of everyone ({totalVisible} addresses in visible groups)
              </button>
              {state.everyone && (
                <section className="result" aria-live="polite">
                  <div className="result-title">
                    <Target />
                    <span>Middle of everyone · {methodInfo.label}</span>
                  </div>
                  <div className={`result-place${state.everyone.address ? '' : ' pending'}`} dir="auto">
                    {state.everyone.address ?? 'Looking up the nearest address…'}
                  </div>
                  <div className="coords">
                    <code>
                      {formatCoord(state.everyone.lat)}, {formatCoord(state.everyone.lng)}
                    </code>
                  </div>
                  <div className="result-links">
                    <a href={`https://www.google.com/maps?q=${state.everyone.lat},${state.everyone.lng}`} target="_blank" rel="noopener noreferrer">
                      Open in Google Maps
                    </a>
                  </div>
                </section>
              )}
            </div>
          )}

          <p className="note" style={{ marginTop: 20 }}>
            Addresses come from OpenStreetMap via Photon. Everything you enter stays in this browser; only the share link carries it.
          </p>
        </div>
      </aside>

      <MapView
        groups={state.groups}
        activeGroupId={group.id}
        everyone={state.everyone}
        pinMode={pinMode}
        pinTarget={{ name: group.name, color: group.color }}
        onPin={({ lat, lng }) => addPoint(lat, lng)}
        onExitPin={() => setPinMode(false)}
        onSelectGroup={(id) => dispatch({ type: 'group/select', id })}
        onMoveAddress={async (groupId, id, { lat, lng }) => {
          dispatch({ type: 'address/update', groupId, id, patch: { lat, lng } });
          try {
            const place = await reverse(lat, lng);
            dispatch({ type: 'address/update', groupId, id, patch: { address: place ? place.address : `${formatCoord(lat)}, ${formatCoord(lng)}` } });
          } catch {
            dispatch({ type: 'address/update', groupId, id, patch: { address: `${formatCoord(lat)}, ${formatCoord(lng)}` } });
          }
        }}
      />

      <PasteDialog
        open={pasteOpen}
        bias={bias}
        onClose={() => setPasteOpen(false)}
        onAdd={(place, label) => dispatch({ type: 'address/add', groupId: group.id, place, label })}
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
