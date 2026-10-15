// Small inline icon set. Each takes the current text colour.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

export const Search = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const Trash = () => (
  <svg {...base}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const Pencil = () => (
  <svg {...base}>
    <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" />
  </svg>
);

export const Eye = ({ off }) =>
  off ? (
    <svg {...base}>
      <path d="M3 3l18 18M10.6 10.6A2 2 0 0 0 13.4 13.4M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.7 3.7M6.6 6.6C4.4 8 2.8 10 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" />
    </svg>
  ) : (
    <svg {...base}>
      <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

export const Target = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);

export const Locate = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="8" />
  </svg>
);

export const Copy = () => (
  <svg {...base}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </svg>
);

export const Close = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Logo = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="16" cy="16" r="3.5" fill="#E4572E" />
    <path d="M16 2v7M16 23v7M2 16h7M23 16h7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
