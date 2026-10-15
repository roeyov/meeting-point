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

// Drop modulepreload hints; everything is inline now.
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const out = join(dist, 'meeting-point.html');
writeFileSync(out, html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`wrote ${out} (${kb} KB); assets: ${readdirSync(join(dist, 'assets')).join(', ')}`);
