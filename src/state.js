// App state: groups of addresses, the chosen "middle" method, and results.
// Persisted to localStorage and encodable into a share link.

export const GROUP_COLORS = ['#E4572E', '#1B4FD8', '#19A078', '#8E3FC2', '#E0A106', '#D8257F', '#0E8A9E', '#7A5230'];

const STORAGE_KEY = 'meeting-point:v1';

export const uid = () => Math.random().toString(36).slice(2, 10);

export function nextColor(groups) {
  const used = new Set(groups.map((g) => g.color));
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[groups.length % GROUP_COLORS.length];
}

export function newGroup(groups, name) {
  return {
    id: uid(),
    name: name ?? `Group ${groups.length + 1}`,
    color: nextColor(groups),
    visible: true,
    addresses: [],
    result: null,
  };
}

export function initialState() {
  const g = newGroup([], 'Friday dinner');
  return { groups: [g], activeGroupId: g.id, method: 'centroid', everyone: null };
}

// --- persistence ---------------------------------------------------------

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode); the app still works */
  }
}

function sanitize(state) {
  if (!state || !Array.isArray(state.groups) || !state.groups.length) return null;
  const groups = state.groups.map((g, i) => ({
    id: g.id || uid(),
    name: g.name || `Group ${i + 1}`,
    color: g.color || GROUP_COLORS[i % GROUP_COLORS.length],
    visible: g.visible !== false,
    addresses: (g.addresses ?? []).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)).map((a) => ({
      id: a.id || uid(),
      label: a.label ?? '',
      address: a.address ?? '',
      lat: a.lat,
      lng: a.lng,
      weight: Number.isFinite(a.weight) ? a.weight : 1,
    })),
    result: g.result ?? null,
  }));
  const activeGroupId = groups.some((g) => g.id === state.activeGroupId) ? state.activeGroupId : groups[0].id;
  return { groups, activeGroupId, method: state.method || 'centroid', everyone: state.everyone ?? null };
}

export function loadState() {
  const fromHash = decodeShare(window.location.hash);
  if (fromHash) return fromHash;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = sanitize(JSON.parse(raw));
      if (s) return s;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return initialState();
}

// --- share link ----------------------------------------------------------
// Compact encoding: only what is needed to rebuild the groups.

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(state) {
  const payload = {
    m: state.method,
    g: state.groups.map((g) => ({
      n: g.name,
      c: g.color,
      a: g.addresses.map((a) => [a.label, a.address, +a.lat.toFixed(6), +a.lng.toFixed(6), a.weight]),
    })),
  };
  return `#s=${b64urlEncode(JSON.stringify(payload))}`;
}

export function decodeShare(hash) {
  const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(hash || '');
  if (!m) return null;
  try {
    const p = JSON.parse(b64urlDecode(m[1]));
    const groups = (p.g ?? []).map((g, i) => ({
      id: uid(),
      name: g.n || `Group ${i + 1}`,
      color: g.c || GROUP_COLORS[i % GROUP_COLORS.length],
      visible: true,
      addresses: (g.a ?? []).map(([label, address, lat, lng, weight]) => ({
        id: uid(),
        label: label ?? '',
        address: address ?? '',
        lat,
        lng,
        weight: Number.isFinite(weight) ? weight : 1,
      })),
      result: null,
    }));
    return sanitize({ groups, activeGroupId: groups[0]?.id, method: p.m, everyone: null });
  } catch {
    return null;
  }
}

// --- reducer -------------------------------------------------------------

function updateGroup(state, id, fn) {
  return { ...state, groups: state.groups.map((g) => (g.id === id ? fn(g) : g)) };
}

function stale(group) {
  return group.result ? { ...group, result: { ...group.result, stale: true } } : group;
}

export function reducer(state, action) {
  switch (action.type) {
    case 'load':
      return action.state;

    case 'group/add': {
      const g = newGroup(state.groups);
      return { ...state, groups: [...state.groups, g], activeGroupId: g.id, everyone: null };
    }
    case 'group/select':
      return { ...state, activeGroupId: action.id };
    case 'group/rename':
      return updateGroup(state, action.id, (g) => ({ ...g, name: action.name }));
    case 'group/color':
      return updateGroup(state, action.id, (g) => ({ ...g, color: action.color }));
    case 'group/toggle':
      return updateGroup(state, action.id, (g) => ({ ...g, visible: !g.visible }));
    case 'group/remove': {
      if (state.groups.length === 1) {
        // Keep one group around; just empty it.
        return updateGroup(state, action.id, (g) => ({ ...g, addresses: [], result: null }));
      }
      const groups = state.groups.filter((g) => g.id !== action.id);
      const activeGroupId = state.activeGroupId === action.id ? groups[0].id : state.activeGroupId;
      return { ...state, groups, activeGroupId, everyone: null };
    }
    case 'group/clear':
      return updateGroup(state, action.id, (g) => ({ ...g, addresses: [], result: null }));

    case 'address/add':
      return {
        ...updateGroup(state, action.groupId, (g) =>
          stale({
            ...g,
            addresses: [
              ...g.addresses,
              {
                id: action.id ?? uid(),
                label: action.label ?? '',
                address: action.place.address,
                lat: action.place.lat,
                lng: action.place.lng,
                weight: 1,
              },
            ],
          }),
        ),
        everyone: null,
      };
    case 'address/update':
      return {
        ...updateGroup(state, action.groupId, (g) => {
          const geometryChanged = 'lat' in action.patch || 'lng' in action.patch || 'weight' in action.patch;
          const next = { ...g, addresses: g.addresses.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)) };
          return geometryChanged ? stale(next) : next;
        }),
        everyone: 'lat' in action.patch || 'weight' in action.patch ? null : state.everyone,
      };
    case 'address/remove':
      return {
        ...updateGroup(state, action.groupId, (g) => stale({ ...g, addresses: g.addresses.filter((a) => a.id !== action.id) })),
        everyone: null,
      };

    case 'method/set':
      return {
        ...state,
        method: action.method,
        groups: state.groups.map(stale),
        everyone: null,
      };

    case 'result/set':
      return updateGroup(state, action.groupId, (g) => ({ ...g, result: action.result }));
    case 'result/address':
      return updateGroup(state, action.groupId, (g) =>
        g.result ? { ...g, result: { ...g.result, address: action.address } } : g,
      );
    case 'everyone/set':
      return { ...state, everyone: action.result };

    default:
      return state;
  }
}
