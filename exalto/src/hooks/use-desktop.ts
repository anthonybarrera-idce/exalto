import { Dimensions } from 'react-native';

/** Native: always the phone layout. The web build has a desktop layout (use-desktop.web.ts). */
export const DESKTOP_MIN_WIDTH = 900;
export const SIDEBAR_WIDTH = 248;
/** No caps on phones: the artwork and Listen view use the screen width. */
export const PLAYER_ART_MAX = Infinity;
export const PLAYER_CONTENT_MAX = undefined;

export function useIsDesktop() {
  return false;
}

/** Native: the player is as wide as the screen. */
export function playerAreaWidth() {
  return Dimensions.get('window').width;
}
