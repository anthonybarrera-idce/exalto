import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/** Window width where the web app switches from the phone layout to the sidebar layout. Keep in sync with +html.tsx. */
export const DESKTOP_MIN_WIDTH = 900;
/** Width of the desktop sidebar. */
export const SIDEBAR_WIDTH = 248;
/** Largest the player's artwork and its Listen view get, so a full-width player on desktop doesn't blow them up. */
export const PLAYER_ART_MAX = 420;
export const PLAYER_CONTENT_MAX = 560;

/**
 * Web: true in a desktop-size window. Static rendering has no window, so the first render (and the
 * pre-rendered HTML) uses the phone layout and switches after hydration, like use-color-scheme.web.ts.
 */
export function useIsDesktop() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { width } = useWindowDimensions();
  return hydrated && width >= DESKTOP_MIN_WIDTH;
}

/** Phone-style column the web layout caps at between 640 px and DESKTOP_MIN_WIDTH (see +html.tsx). */
const NARROW_COLUMN_WIDTH = 480;

/**
 * Width the player lays itself out in, read once at load like the player's other sizes: the centred
 * column on a tablet-size window, otherwise the whole window (the player is full width on desktop too).
 */
export function playerAreaWidth() {
  const width = typeof window === 'undefined' ? NARROW_COLUMN_WIDTH : window.innerWidth;
  if (width >= 640 && width < DESKTOP_MIN_WIDTH) return NARROW_COLUMN_WIDTH;
  return width;
}
