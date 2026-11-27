import Head from 'expo-router/head';
import { useEffect } from 'react';

import { useAuth } from '@/context/auth-context';
import { DESKTOP_MIN_WIDTH } from '@/hooks/use-desktop';

const TITLE = 'Exalto · Himnario digital';

/**
 * Web only (web.exalto.app):
 * - Sets the page title. expo-router's head manager writes its own (empty) <title> ahead of the one in +html.tsx.
 * - The website's "Sign in" button links to `/?signin=1` (Hosting also redirects `/signin` there). Open the account
 *   sheet on the welcome page, then drop the parameter so a reload or "Continue as guest" doesn't bring it back.
 *   Someone already signed in just sees their settings.
 * - Tags each modal for the desktop styles in +html.tsx (see useSheetTags).
 */
export function WebEntry() {
  const { ready, user, openAccount } = useAuth();
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('signin')) return;
    url.searchParams.delete('signin');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    openAccount(user ? 'settings' : 'welcome');
  }, [ready, user, openAccount]);
  useSheetTags();
  return (
    <Head>
      <title>{TITLE}</title>
    </Head>
  );
}

/**
 * react-native-web renders every Modal as `[role=dialog][aria-modal=true]` portalled to <body>, with no hint of
 * which kind it is. Full sheets have an opaque background; transparent ones (hymnal picker, menus) draw their own
 * backdrop and card. Mark each new dialog with data-sheet="panel" or "overlay" so +html.tsx turns only full sheets
 * into centred desktop panels, and fade those panels in. Runs before the first paint of the dialog.
 */
function useSheetTags() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
    const tag = () => {
      document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]:not([data-sheet])').forEach((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const transparent = bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg);
        el.dataset.sheet = transparent ? 'overlay' : 'panel';
        const desktop = window.innerWidth >= DESKTOP_MIN_WIDTH;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!transparent && desktop && !reduce && el.animate) {
          el.animate(
            [
              { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          );
        }
      });
    };
    tag();
    const observer = new MutationObserver(tag);
    // react-native-web can turn an existing element into the dialog (it sets role/aria-modal on open), so watch
    // those attributes as well as new elements.
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'] });
    return () => observer.disconnect();
  }, []);
}
