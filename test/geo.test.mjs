import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centroid, geometricMedian, minimaxCenter, distanceKm } from '../src/geo.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('centroid of one point is that point', () => {
  const c = centroid([{ lat: 32.8, lng: 34.99 }]);
  assert.ok(close(c.lat, 32.8) && close(c.lng, 34.99));
  assert.ok(close(c.spread, 0));
});

test('centroid handles the date line', () => {
  // Naive averaging would give lng 0 (the Gulf of Guinea). The real middle is at 180.
  const c = centroid([
    { lat: 0, lng: 179 },
    { lat: 0, lng: -179 },
  ]);
  assert.ok(close(c.lat, 0));
  assert.ok(close(Math.abs(c.lng), 180));
});

test('centroid of symmetric points around the equator sits on the equator', () => {
  const c = centroid([
    { lat: 10, lng: 20 },
    { lat: -10, lng: 20 },
  ]);
  assert.ok(close(c.lat, 0) && close(c.lng, 20));
});

test('weights pull the middle toward the heavier address', () => {
  const pts = [
    { lat: 0, lng: 0, weight: 3 },
    { lat: 0, lng: 10, weight: 1 },
  ];
  const c = centroid(pts);
  assert.ok(c.lng > 0 && c.lng < 5, `expected lng in (0,5), got ${c.lng}`);
});

test('zero weight excludes a point', () => {
  const c = centroid([
    { lat: 0, lng: 0, weight: 1 },
    { lat: 50, lng: 50, weight: 0 },
  ]);
  assert.ok(close(c.lat, 0) && close(c.lng, 0));
});

test('antipodal points have no middle', () => {
  const c = centroid([
    { lat: 0, lng: 0 },
    { lat: 0, lng: 180 },
  ]);
  assert.equal(c, null);
});

test('distance Haifa to Tel Aviv is roughly 85 km', () => {
  const km = distanceKm({ lat: 32.794, lng: 34.9896 }, { lat: 32.0853, lng: 34.7818 });
  assert.ok(km > 80 && km < 90, `got ${km}`);
});

test('geometric median resists an outlier better than the centroid', () => {
  const cluster = [
    { lat: 32.79, lng: 34.99 },
    { lat: 32.8, lng: 35.0 },
    { lat: 32.81, lng: 34.98 },
    { lat: 32.79, lng: 35.01 },
  ];
  const outlier = { lat: 31.77, lng: 35.21 }; // Jerusalem
  const pts = [...cluster, outlier];
  const c = centroid(pts);
  const m = geometricMedian(pts);
  const clusterCentre = centroid(cluster);
  const dC = distanceKm(c, clusterCentre);
  const dM = distanceKm(m, clusterCentre);
  assert.ok(dM < dC, `median ${dM} km should be closer than centroid ${dC} km`);
});

test('minimax centre equalises the two farthest points', () => {
  const pts = [
    { lat: 32.79, lng: 34.99 },
    { lat: 32.8, lng: 35.0 },
    { lat: 31.77, lng: 35.21 },
  ];
  const m = minimaxCenter(pts);
  const dists = pts.map((p) => distanceKm(m, p));
  const far = Math.max(...dists);
  // Smallest enclosing circle of these three: the two extremes are the diameter.
  const diameter = distanceKm(pts[0], pts[2]);
  assert.ok(Math.abs(far - diameter / 2) < 0.5, `longest trip ${far} vs half-diameter ${diameter / 2}`);
});
