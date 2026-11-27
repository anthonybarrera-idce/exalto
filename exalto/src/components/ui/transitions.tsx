import { useIsFocused } from 'expo-router';
import { type ComponentType, type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  Keyframe,
  LayoutAnimationConfig,
  SlideInDown,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Shared motion for screen changes: calm, quick, ease-out. Everything here is a Reanimated layout animation,
 * so it runs on the UI thread and never re-renders React per frame.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** iOS sheet curve, for things that rise from the bottom. */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export const PAGE_MS = 280;
export const FADE_MS = 200;
/** How far the page underneath drifts while the next one slides over it (iOS-style parallax, kept small). */
const UNDER_SHIFT = 48;

// Forward: the new page slides in from the right over the old one, which drifts left and fades.
const pushIn = SlideInRight.duration(PAGE_MS).easing(EASE_OUT);
const pushOut = new Keyframe({
  0: { opacity: 1, transform: [{ translateX: 0 }] },
  100: { opacity: 0, transform: [{ translateX: -UNDER_SHIFT }], easing: EASE_OUT },
}).duration(PAGE_MS);
// Back: the current page slides out to the right, uncovering the previous one coming back from the left.
const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: -UNDER_SHIFT }] },
  100: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE_OUT },
}).duration(PAGE_MS);
const popOut = SlideOutRight.duration(PAGE_MS - 30).easing(EASE_OUT);
// Reduce Motion: no movement, just a short cross-fade.
const fadeIn = FadeIn.duration(FADE_MS);
const fadeOut = FadeOut.duration(FADE_MS - 60);

/** Fade for content swapped in place (player modes, tab screens). */
export const contentFadeIn = FadeIn.duration(FADE_MS).easing(EASE_OUT);
/** A sheet rising inside a Modal whose backdrop fades (`animationType="fade"`). */
export function useSheetEntering() {
  const reduced = useReducedMotion();
  return reduced ? fadeIn : SlideInDown.duration(PAGE_MS).easing(EASE_SHEET);
}

/** A floating menu in a fading Modal: rises a few points as it fades in. */
const menuIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 16 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
}).duration(240);
export function useMenuEntering() {
  const reduced = useReducedMotion();
  return reduced ? fadeIn : menuIn;
}

/**
 * Tab screens slide in from the side of the tab you tapped (from the right when moving right along the bar),
 * fading as they come. The tab bar swaps screens instantly, so only the incoming screen moves, and only part of
 * the width: a full-width slide would sweep across an empty background.
 */
const TAB_MS = 260;
const TAB_SHIFT = 72;
/** The tab shown last, by its place in the bar; null until the first tab has shown. */
let lastTab: number | null = null;

function TabScreenTransition({ index, children }: { index: number; children: ReactNode }) {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const shown = useSharedValue(1);
  const from = useSharedValue(0);
  useEffect(() => {
    if (!focused) return;
    // Read the previous tab before recording this one (the React Compiler treats a module variable as
    // unchanging within the effect, so read-after-write would see the new value).
    // The first tab at launch just appears (the splash covers it).
    if (lastTab !== null && lastTab !== index) {
      from.set(index > lastTab ? 1 : -1);
      shown.set(0);
      shown.set(withTiming(1, { duration: TAB_MS, easing: EASE_OUT }));
    }
    lastTab = index;
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(shown.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
    // Reduce Motion: fade only.
    transform: [{ translateX: reduced ? 0 : (1 - shown.value) * TAB_SHIFT * from.value }],
  }));
  return <Animated.View style={[styles.flex, style]}>{children}</Animated.View>;
}

/** Wraps a tab's route component so switching to it slides it in; `index` is its place in the tab bar. */
export function withTabTransition<P extends object>(Screen: ComponentType<P>, index: number) {
  function TabScreen(props: P) {
    return (
      <TabScreenTransition index={index}>
        <Screen {...props} />
      </TabScreenTransition>
    );
  }
  TabScreen.displayName = `withTabTransition(${Screen.displayName ?? Screen.name})`;
  return TabScreen;
}

type Direction = 'forward' | 'back';

/**
 * Pages swapped by state (no navigator), with a push/pop slide between them. `depthOf` says how deep a page is:
 * going deeper (or sideways) slides forward, going shallower slides back. The first page shows without animation,
 * and nothing animates on unmount (the sheet or screen around it has its own transition).
 *
 * Every page is absolutely filled and opaque, so the old and new page can overlap during the slide.
 */
export function PageStack<P extends string>({
  page,
  depthOf,
  renderPage,
  pageStyle,
  style,
}: {
  page: P;
  depthOf: (page: P, from: P) => number;
  renderPage: (page: P) => ReactNode;
  pageStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  // `shown` trails `page` by one synchronous render: first the outgoing page re-renders with the exit that fits
  // the new direction (exit animations use the props a view had when it unmounted), then the swap happens.
  // Both renders land before the next paint, so nothing visibly lags.
  const [shown, setShown] = useState(page);
  const [dir, setDir] = useState<Direction>('forward');
  const pending = page !== shown;
  const nextDir: Direction = pending ? (depthOf(page, shown) < depthOf(shown, page) ? 'back' : 'forward') : dir;

  useLayoutEffect(() => {
    if (page === shown) return;
    if (nextDir !== dir) setDir(nextDir);
    else setShown(page);
  }, [page, shown, dir, nextDir]);

  const forward = dir === 'forward';
  // The page that moves is on top: the incoming one going forward, the outgoing one going back.
  const onTop = pending ? !forward : forward;

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <Animated.View style={[styles.flex, style]}>
        <Animated.View
          key={shown}
          entering={reduced ? fadeIn : forward ? pushIn : popIn}
          exiting={reduced ? fadeOut : forward ? pushOut : popOut}
          style={[StyleSheet.absoluteFill, { zIndex: onTop ? 1 : 0 }, pageStyle]}>
          {renderPage(shown)}
        </Animated.View>
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
