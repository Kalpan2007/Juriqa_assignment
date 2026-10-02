import { cssVariablesFor } from './tokens';

/**
 * Emits the token set as CSS custom properties, in `<head>`, before the first paint.
 *
 * A server component rendering a plain <style> tag — not a client-side effect — so the
 * variables exist on the very first byte and there is no flash of unstyled or wrong-theme
 * content (ARCHITECTURE section 13.1).
 *
 * Dark mode resolves in three layers, deliberately in this order:
 *   1. `:root`                         — light is the default
 *   2. `prefers-color-scheme: dark`    — follow the OS, but only when the user has not chosen
 *   3. `[data-theme="dark"]`           — an explicit choice always wins
 * The media query is guarded with `:root:not([data-theme='light'])` so someone who explicitly
 * picked light does not get dark from their OS.
 */
export function ThemeStyles() {
  const css = `
:root {
  ${cssVariablesFor('light')}
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    ${cssVariablesFor('dark')}
    color-scheme: dark;
  }
}

:root[data-theme='dark'] {
  ${cssVariablesFor('dark')}
  color-scheme: dark;
}
`;

  return <style id="ca-theme" dangerouslySetInnerHTML={{ __html: css }} />;
}
