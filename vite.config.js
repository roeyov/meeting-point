import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every asset path relative, so the same build works
// on GitHub Pages (served from /<repo>/), on any static host, and as a
// single HTML file opened straight from disk.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    assetsInlineLimit: 16384,
  },
});
