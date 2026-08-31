// Hand-written SVG. No icon library, no emoji as a UI glyph — either is an
// AI-default tell. Every icon is aria-hidden; the label lives on the control.

const base = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': 'true', focusable: 'false',
};

export const IconSun = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (p) => (
  <svg {...base} {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
);

export const IconSignOut = (p) => (
  <svg {...base} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const IconUpload = (p) => (
  <svg {...base} {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const IconCheck = (p) => (
  <svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>
);

export const IconAlert = (p) => (
  <svg {...base} {...p}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);

export const IconArrow = (p) => (
  <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export const IconEdit = (p) => (
  <svg {...base} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const IconClose = (p) => (
  <svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);

export const IconBack = (p) => (
  <svg {...base} {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
);


/* ── Social marks ─────────────────────────────────────────────────────────
   Hand-drawn, like every other icon here — no icon package. These are filled
   brand glyphs rather than the 1.5px strokes above, so they take their own base:
   a brand mark drawn as an outline stops being recognisable as that brand. */
const brand = {
  width: 20, height: 20, viewBox: '0 0 24 24',
  fill: 'currentColor', stroke: 'none',
  'aria-hidden': 'true', focusable: 'false',
};

export const IconFacebook = (p) => (
  <svg {...brand} {...p}>
    <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.54-1.5h1.64V3.63A22 22 0 0 0 14.3 3.5c-2.37 0-4 1.45-4 4.1v2.3H7.6V13h2.7v8Z" />
  </svg>
);

export const IconInstagram = (p) => (
  <svg {...brand} {...p}>
    <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9c-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.98c-3.15 0-3.52.01-4.76.07-1.15.05-1.77.24-2.19.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.42-.35 1.04-.4 2.19-.06 1.24-.07 1.61-.07 4.76s.01 3.52.07 4.76c.05 1.15.24 1.77.4 2.19.22.55.47.94.88 1.35.41.41.8.66 1.35.88.42.16 1.04.35 2.19.4 1.24.06 1.61.07 4.76.07s3.52-.01 4.76-.07c1.15-.05 1.77-.24 2.19-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.42.35-1.04.4-2.19.06-1.24.07-1.61.07-4.76s-.01-3.52-.07-4.76c-.05-1.15-.24-1.77-.4-2.19a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.42-.16-1.04-.35-2.19-.4-1.24-.06-1.61-.07-4.76-.07Zm0 3.37a5.49 5.49 0 1 1 0 10.98 5.49 5.49 0 0 1 0-10.98Zm0 9.05a3.56 3.56 0 1 0 0-7.12 3.56 3.56 0 0 0 0 7.12Zm6.99-9.27a1.28 1.28 0 1 1-2.57 0 1.28 1.28 0 0 1 2.57 0Z" />
  </svg>
);

export const IconLinkedIn = (p) => (
  <svg {...brand} {...p}>
    <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM2.9 21h4.16V9.4H2.9V21Zm7.2 0h4.15v-6.1c0-1.6.3-3.16 2.3-3.16 1.96 0 1.99 1.84 1.99 3.26V21h4.15v-6.83c0-3.6-.78-6.37-4.98-6.37-2.02 0-3.38 1.11-3.94 2.16h-.05V9.4H10.1V21Z" />
  </svg>
);

export const IconYouTube = (p) => (
  <svg {...brand} {...p}>
    <path d="M23 12s0-3.6-.46-5.33a2.77 2.77 0 0 0-1.95-1.96C18.86 4.25 12 4.25 12 4.25s-6.86 0-8.59.46A2.77 2.77 0 0 0 1.46 6.67C1 8.4 1 12 1 12s0 3.6.46 5.33c.25.95 1 1.7 1.95 1.96 1.73.46 8.59.46 8.59.46s6.86 0 8.59-.46a2.77 2.77 0 0 0 1.95-1.96C23 15.6 23 12 23 12ZM9.75 15.3V8.7L15.5 12l-5.75 3.3Z" />
  </svg>
);
