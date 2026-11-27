import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web only: the HTML shell every statically rendered page shares (web.exalto.app).
 * Runs in Node at export time, so no browser APIs here.
 */
const TITLE = 'Exalto · Himnario digital';
const DESCRIPTION =
  'Escucha, lee y practica himnos desde el navegador. Sin cuenta, o inicia sesión para guardar tus favoritos.';
const URL = 'https://web.exalto.app/';
const BG = '#1A120A';

export default function Root({ children }: PropsWithChildren) {
  // SDK 58: the router passes its <head>/<body> additions (scripts, styles, metadata) through this context.
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content={BG} />
        <meta name="color-scheme" content="dark" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Exalto" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Exalto" />
        <meta property="og:url" content={URL} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="https://web.exalto.app/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="628" />
        <meta property="og:locale" content="es_US" />
        <meta property="og:locale:alternate" content="en_US" />
        <meta name="twitter:card" content="summary_large_image" />

        {/* Disables body scrolling so ScrollViews behave like on native. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

/**
 * Dark page behind the app and no sideways scroll.
 * - 640–899 px (tablet-size windows): the phone layout sits in a centred 480 px column.
 * - 900 px and up (DESKTOP_MIN_WIDTH in hooks/use-desktop.web.ts): the app switches to its sidebar layout
 *   (components/app-tabs.web.tsx), and full sheets open as centred panels over a dimmed page.
 *   components/web-entry.web.tsx tags each modal: data-sheet="panel" for full sheets (account, search, practice),
 *   "overlay" for transparent ones that draw their own backdrop (hymnal picker, menus), which are left as they are.
 * - Inputs: no browser focus box inside the app's rounded fields.
 */
const css = `
html, body { background-color: ${BG}; overflow-x: hidden; }
input:focus, input:focus-visible, textarea:focus, textarea:focus-visible { outline: none; }
@media (min-width: 900px) {
  [role="dialog"][aria-modal="true"][data-sheet="panel"] {
    /* Fade in (web-entry.web.tsx) instead of react-native-web's slide up from the bottom of the window. */
    animation-duration: 1ms !important;
    top: 32px !important;
    bottom: 32px !important;
    left: calc(50% - 280px) !important;
    right: calc(50% - 280px) !important;
    border-radius: 20px !important;
    overflow: hidden !important;
    box-shadow: 0 0 0 1px #2E2419, 0 0 0 100vmax rgba(8, 5, 2, 0.6), 0 30px 80px rgba(0, 0, 0, 0.6) !important;
  }
}
@media (min-width: 640px) and (max-width: 899.98px) {
  body { background: radial-gradient(ellipse at top, #2A1D10 0%, #120C06 70%) fixed; }
  #root {
    max-width: 480px;
    margin: 0 auto;
    background-color: ${BG};
    box-shadow: 0 0 0 1px #2E2419, 0 30px 80px rgba(0, 0, 0, 0.55);
  }
  /* react-native-web portals each Modal (account sheet, search, menus…) to <body>: keep them in the same column. */
  [role="dialog"][aria-modal="true"] {
    left: calc(50% - 240px) !important;
    right: calc(50% - 240px) !important;
  }
}
`;
