/**
 * THE single source of every visual value in the app (ARCHITECTURE section 13.1).
 *
 * Nothing outside this folder may contain a colour, font, size, radius, shadow, z-index or
 * motion value — lint fails the build if it does. Change a token here and it changes
 * everywhere, including the shadcn/ui primitives, because they read the same CSS variables.
 *
 * Semantic colours are named by MEANING (`verified`, `severityHigh`, `statusFailed`), never
 * by hue. That is what lets dark mode, and any later rebrand, be a change in this one file.
 *
 * Visual direction: a calm legal tool. Warm neutral paper, deep ink text, one restrained
 * accent. Serif for document text so it reads like a contract; clean sans for the interface.
 */
export const tokens = {
  color: {
    light: {
      // --- surfaces ---------------------------------------------------------
      bg: '#faf9f7', // warm paper, not clinical white
      surface: '#ffffff',
      surfaceMuted: '#f3f1ed', // sidebar, table headers
      surfaceHover: '#eceae5',
      border: '#e2ded7',
      borderStrong: '#cdc7bd',

      // --- text -------------------------------------------------------------
      fg: '#1c1917', // deep ink
      fgMuted: '#6b645c',
      fgSubtle: '#9a938a',
      fgOnAccent: '#ffffff',

      // --- accent -----------------------------------------------------------
      primary: '#1e4d4a', // deep teal: serious, not corporate blue
      primaryHover: '#163b39',
      primaryFg: '#ffffff',
      primarySubtle: '#e8efee',
      focusRing: '#1e4d4a',

      // --- quote verification (the heart of the product) --------------------
      verified: '#1f6f43',
      verifiedBg: '#e9f4ed',
      verifiedBorder: '#bfdfcd',
      unverified: '#9a5b00',
      unverifiedBg: '#fdf3e3',
      unverifiedBorder: '#f0dcb8',

      // --- feedback ---------------------------------------------------------
      danger: '#9f2d20',
      dangerBg: '#fbecea',
      dangerBorder: '#f0cdc8',
      warning: '#9a5b00',
      warningBg: '#fdf3e3',
      success: '#1f6f43',
      successBg: '#e9f4ed',

      // --- comparison severity ---------------------------------------------
      severityHigh: '#9f2d20',
      severityHighBg: '#fbecea',
      severityMedium: '#9a5b00',
      severityMediumBg: '#fdf3e3',
      severityLow: '#6b645c',
      severityLowBg: '#f3f1ed',

      // --- document processing status ---------------------------------------
      statusUploaded: '#6b645c',
      statusProcessing: '#8a5a00',
      statusReady: '#1f6f43',
      statusFailed: '#9f2d20',

      // --- citation highlighting in the viewer ------------------------------
      highlight: '#ffe9a8',
      highlightActive: '#ffcf4d',
      highlightBorder: '#e0a800',

      // --- diffs ------------------------------------------------------------
      diffInsert: '#1f6f43',
      diffInsertBg: '#dff0e5',
      diffDelete: '#9f2d20',
      diffDeleteBg: '#fbe0dc',
    },

    dark: {
      bg: '#17171a',
      surface: '#1f1f23',
      surfaceMuted: '#26262b',
      surfaceHover: '#2e2e34',
      border: '#34343b',
      borderStrong: '#474751',

      fg: '#f2f0ec',
      fgMuted: '#a7a39c',
      fgSubtle: '#767169',
      fgOnAccent: '#ffffff',

      primary: '#5ea8a1',
      primaryHover: '#78bdb6',
      primaryFg: '#10201f',
      primarySubtle: '#1d2e2d',
      focusRing: '#5ea8a1',

      verified: '#6cc08d',
      verifiedBg: '#16271d',
      verifiedBorder: '#2c4a37',
      unverified: '#e0a955',
      unverifiedBg: '#2a2114',
      unverifiedBorder: '#4a3a1e',

      danger: '#e8847a',
      dangerBg: '#2b1715',
      dangerBorder: '#4d2722',
      warning: '#e0a955',
      warningBg: '#2a2114',
      success: '#6cc08d',
      successBg: '#16271d',

      severityHigh: '#e8847a',
      severityHighBg: '#2b1715',
      severityMedium: '#e0a955',
      severityMediumBg: '#2a2114',
      severityLow: '#a7a39c',
      severityLowBg: '#26262b',

      statusUploaded: '#a7a39c',
      statusProcessing: '#e0a955',
      statusReady: '#6cc08d',
      statusFailed: '#e8847a',

      highlight: '#6b5518',
      highlightActive: '#9c7c1f',
      highlightBorder: '#c9a033',

      diffInsert: '#6cc08d',
      diffInsertBg: '#16271d',
      diffDelete: '#e8847a',
      diffDeleteBg: '#2b1715',
    },
  },

  font: {
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    /** The document reading view — contracts should look like contracts. */
    serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
    /** Clause numbers, ids, offsets. */
    mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },

  /** Type scale: size / line-height / weight / tracking. */
  text: {
    display: { size: '2.25rem', lineHeight: '2.5rem', weight: '600', tracking: '-0.02em' },
    h1: { size: '1.75rem', lineHeight: '2.125rem', weight: '600', tracking: '-0.015em' },
    h2: { size: '1.375rem', lineHeight: '1.75rem', weight: '600', tracking: '-0.01em' },
    h3: { size: '1.125rem', lineHeight: '1.5rem', weight: '600', tracking: '0' },
    body: { size: '0.9375rem', lineHeight: '1.5rem', weight: '400', tracking: '0' },
    small: { size: '0.875rem', lineHeight: '1.25rem', weight: '400', tracking: '0' },
    caption: { size: '0.8125rem', lineHeight: '1.125rem', weight: '400', tracking: '0.005em' },
    /** Document reading view. */
    document: { size: '1rem', lineHeight: '1.75rem', weight: '400', tracking: '0' },
  },

  space: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },

  radius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    card: '10px',
    pill: '9999px',
  },

  shadow: {
    card: '0 1px 2px 0 rgb(28 25 23 / 0.04), 0 1px 6px -1px rgb(28 25 23 / 0.06)',
    popover: '0 4px 12px -2px rgb(28 25 23 / 0.10), 0 2px 6px -2px rgb(28 25 23 / 0.06)',
    modal: '0 16px 40px -8px rgb(28 25 23 / 0.22)',
    focus: '0 0 0 3px rgb(30 77 74 / 0.22)',
  },

  z: {
    base: '0',
    sidebar: '10',
    header: '20',
    overlay: '40',
    modal: '50',
    toast: '60',
  },

  motion: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
    easing: 'cubic-bezier(0.2, 0, 0.13, 1)',
  },

  layout: {
    sidebarWidth: '248px',
    chatPanelMin: '380px',
    viewerMin: '420px',
    contentMax: '1600px',
    headerHeight: '56px',
    /** The workspace split view: viewport minus the page header and padding. */
    workspaceHeight: 'calc(100dvh - 10rem)',
    /** A chat bubble never spans the full column; it reads better with a margin. */
    messageMax: '85%',
  },
} as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof Tokens['color']['light'];
export type TextToken = keyof Tokens['text'];

/**
 * Serialises the token set into the CSS custom properties that `globals.css` wires into
 * Tailwind utilities. Keeping this conversion in code means the CSS file holds variable
 * NAMES only and can never carry a stale copy of a value.
 */
export function cssVariablesFor(mode: 'light' | 'dark'): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(tokens.color[mode])) {
    lines.push(`--color-${kebab(key)}: ${value};`);
  }

  // Everything below is mode-independent, so it is emitted only once, with light.
  if (mode === 'light') {
    for (const [key, value] of Object.entries(tokens.font)) {
      lines.push(`--font-${kebab(key)}: ${value};`);
    }
    for (const [key, scale] of Object.entries(tokens.text)) {
      lines.push(`--text-${kebab(key)}: ${scale.size};`);
      lines.push(`--text-${kebab(key)}--line-height: ${scale.lineHeight};`);
      lines.push(`--text-${kebab(key)}--font-weight: ${scale.weight};`);
      lines.push(`--text-${kebab(key)}--letter-spacing: ${scale.tracking};`);
    }
    for (const [key, value] of Object.entries(tokens.space)) {
      lines.push(`--spacing-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(tokens.radius)) {
      lines.push(`--radius-${kebab(key)}: ${value};`);
    }
    for (const [key, value] of Object.entries(tokens.shadow)) {
      lines.push(`--shadow-${kebab(key)}: ${value};`);
    }
    for (const [key, value] of Object.entries(tokens.z)) {
      lines.push(`--z-${kebab(key)}: ${value};`);
    }
    for (const [key, value] of Object.entries(tokens.motion)) {
      lines.push(`--motion-${kebab(key)}: ${value};`);
    }
    for (const [key, value] of Object.entries(tokens.layout)) {
      lines.push(`--layout-${kebab(key)}: ${value};`);
    }
  }

  return lines.join('\n  ');
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
