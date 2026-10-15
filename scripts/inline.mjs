// Turns the Vite build in dist/ into one self-contained HTML file
// (dist/meeting-point.html) that works when opened straight from disk.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');

// <script type="module" crossorigin src="./assets/x.js"></script> → inline
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const code = readFileSync(join(dist, src), 'utf8');
  return `<script type="module">\n${code}\n</script>`;
});

// <link rel="stylesheet" crossorigin href="./assets/x.css"> → inline
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, href) => {
  if (/^https?:/.test(href)) return _;
  const css = readFileSync(join(dist, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// The MapLibre worker is a separate asset; embed it and expose it as a data: URL
// so the map still works when the file is opened from disk. Two details matter:
// browsers refuse blob *module* workers on file:// pages, and MapLibre treats a
// worker URL as classic only when its path ends in ".cjs" – so the data URL
// starts with a "//.cjs?" comment line, which makes MapLibre fetch it and run it
// as a classic blob worker, which file:// pages allow.
const worker = readdirSync(join(dist, 'assets')).find((f) => f.includes('maplibre-gl-worker'));
if (worker) {
  const code = readFileSync(join(dist, 'assets', worker), 'utf8').replace(/<\//g, '<\\/');
  const boot = `<script>window.__MEETING_POINT_WORKER_URL__ = 'data:text/javascript;charset=utf-8,//.cjs?%0A' + encodeURIComponent(${JSON.stringify(code)});</script>`;
  html = html.replace('<script type="module">', `${boot}\n<script type="module">`);
}

// Drop modulepreload hints; everything is inline now.
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const out = join(dist, 'meeting-point.html');
writeFileSync(out, html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`wrote ${out} (${kb} KB); assets: ${readdirSync(join(dist, 'assets')).join(', ')}`);
