// Spherical geometry for finding a "middle" between points on the Earth.
//
// Every point is converted to a unit vector on the sphere. Working in 3D
// avoids the two classic bugs of averaging lat/lng directly: the date line
// (+179 and -179 average to 0 instead of 180) and the poles.

const DEG = Math.PI / 180;
export const EARTH_RADIUS_KM = 6371.0088;

export function toVec({ lat, lng }) {
  const phi = lat * DEG;
  const lam = lng * DEG;
  const c = Math.cos(phi);
  return [c * Math.cos(lam), c * Math.sin(lam), Math.sin(phi)];
}

export function toLatLng([x, y, z]) {
  const lng = Math.atan2(y, x) / DEG;
  const lat = Math.atan2(z, Math.hypot(x, y)) / DEG;
  return { lat, lng };
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(v) {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
}

function clamp1(x) {
  return Math.min(1, Math.max(-1, x));
}

/** Central angle between two points, in radians. */
function angle(va, vb) {
  return Math.acos(clamp1(dot(va, vb)));
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  return angle(toVec(a), toVec(b)) * EARTH_RADIUS_KM;
}

function usable(points) {
  return points.filter((p) => (p.weight ?? 1) > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/**
 * Weighted centroid projected back onto the sphere: the "average location".
 * Returns null when there are no usable points or when the points surround
 * the globe so evenly that no direction wins (the vector sum is ~0).
 *
 * `spread` goes from 0 (everyone at the same spot) to 1 (evenly spread
 * around the whole planet) and is useful for warning about weak answers.
 */
export function centroid(points) {
  const pts = usable(points);
  if (!pts.length) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  for (const p of pts) {
    const wt = p.weight ?? 1;
    const v = toVec(p);
    x += wt * v[0];
    y += wt * v[1];
    z += wt * v[2];
    w += wt;
  }
  const mean = [x / w, y / w, z / w];
  const mag = Math.hypot(mean[0], mean[1], mean[2]);
  if (mag < 1e-9) return null;
  return { ...toLatLng(norm(mean)), spread: 1 - mag };
}

/**
 * Geometric median on the sphere: the point that minimises the total
 * (weighted) travel distance of everyone. Robust to one far-away outlier,
 * which the centroid is not. Spherical Weiszfeld iteration seeded from
 * the centroid.
 */
export function geometricMedian(points, iterations = 200) {
  const pts = usable(points);
  const seed = centroid(pts);
  if (!seed) return null;
  const vecs = pts.map((p) => ({ v: toVec(p), w: p.weight ?? 1 }));
  let v = toVec(seed);
  for (let i = 0; i < iterations; i++) {
    const acc = [0, 0, 0];
    for (const { v: pv, w } of vecs) {
      const d = Math.max(angle(v, pv), 1e-7);
      const k = w / d;
      acc[0] += k * pv[0];
      acc[1] += k * pv[1];
      acc[2] += k * pv[2];
    }
    const next = norm(acc);
    const moved = Math.hypot(next[0] - v[0], next[1] - v[1], next[2] - v[2]);
    v = next;
    if (moved < 1e-12) break;
  }
  return { ...toLatLng(v), spread: seed.spread };
}

/**
 * Minimax centre: the point whose longest trip is as short as possible
 * (centre of the smallest circle enclosing everyone). Weights are ignored
 * because "nobody travels further than X" is a per-person guarantee.
 * Bădoiu–Clarkson style iteration: keep stepping toward whoever is
 * currently farthest, with a shrinking step.
 */
export function minimaxCenter(points, iterations = 600) {
  const pts = usable(points).map((p) => ({ ...p, weight: 1 }));
  const seed = centroid(pts);
  if (!seed) return null;
  const vecs = pts.map((p) => toVec(p));
  let v = toVec(seed);
  for (let k = 1; k <= iterations; k++) {
    let far = vecs[0];
    let farD = -1;
    for (const pv of vecs) {
      const d = angle(v, pv);
      if (d > farD) {
        farD = d;
        far = pv;
      }
    }
    const step = 1 / (k + 1);
    v = norm([v[0] + step * (far[0] - v[0]), v[1] + step * (far[1] - v[1]), v[2] + step * (far[2] - v[2])]);
  }
  return { ...toLatLng(v), spread: seed.spread };
}

export const METHODS = {
  centroid: {
    label: 'Average location',
    hint: 'The centre of gravity of all addresses on the globe.',
    fn: centroid,
  },
  median: {
    label: 'Least total travel',
    hint: 'Minimises the sum of everyone’s distance. Ignores one far outlier better.',
    fn: geometricMedian,
  },
  minimax: {
    label: 'Shortest longest trip',
    hint: 'Nobody travels further than necessary; the fairest for the person furthest away.',
    fn: minimaxCenter,
  },
};

export function computeMiddle(method, points) {
  const m = METHODS[method] ?? METHODS.centroid;
  return m.fn(points);
}

export function formatCoord(n, digits = 5) {
  return Number(n).toFixed(digits);
}

export function formatKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
