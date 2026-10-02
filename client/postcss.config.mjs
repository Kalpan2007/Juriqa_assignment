// Tailwind v4 is a PostCSS plugin; there is no tailwind.config.js.
// The theme is defined in src/app/globals.css via `@theme inline`, which reads the CSS
// variables emitted from src/theme/tokens.ts — so tokens stay the single source of truth.
const config = {
  plugins: ['@tailwindcss/postcss'],
};

export default config;
