// Light / dark theme. 'system' follows the OS; 'light' and 'dark' are explicit
// choices, stored per browser. The CSS reads data-theme on <html>, and the map
// watches that attribute to swap its style.

const KEY = 'meeting-point:theme';

export function readTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function effectiveTheme(theme = readTheme()) {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return theme;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable; the choice just doesn't persist */
  }
}
