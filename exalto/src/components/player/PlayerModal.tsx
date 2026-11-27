import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HymnArt } from "@/components/ui/hymn-art";
import { EASE_OUT, FADE_MS } from "@/components/ui/transitions";
import { BrandGradient, MiniPlayerHeight, Palette, Spacing } from "@/constants/theme";
import { useViewMode } from "@/context/view-mode-context";
import { useAudio } from "@/hooks/use-audio";
import { PLAYER_ART_MAX, playerAreaWidth, useIsDesktop } from "@/hooks/use-desktop";
import { FullPlayer } from "./FullPlayer";
import { MiniPlayer } from "./MiniPlayer";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
// The screen width on phones; on web, the column the player sits in (desktop / tablet-size windows).
const SCREEN_WIDTH = playerAreaWidth();

const TAB_BAR_HEIGHT = 49;
const MINI_OFFSET = 10;
const H_INSET = 10;

// Artwork geometry inside the sheet, in each state.
const MINI_ART_SIZE = 40;
const MINI_ART_TOP = (MiniPlayerHeight - MINI_ART_SIZE) / 2;
const MINI_ART_LEFT = Spacing.three;
const MINI_ART_RADIUS = 8;
const FULL_ART_SIZE = Math.min(SCREEN_WIDTH - 68, PLAYER_ART_MAX); // matches ARTWORK_SIZE in FullPlayer
const FULL_ART_TOP = Spacing.two + 20 + 56; // paddingTop + drag handle + top bar
// Centred in the sheet (24 pt on phones; wide web windows cap the art, so it sits in the middle).
const FULL_ART_LEFT = (SCREEN_WIDTH - 2 * H_INSET - FULL_ART_SIZE) / 2;
const FULL_ART_RADIUS = 16;

/**
 * Critically damped spring: no bounce, and it carries the flick's velocity
 * so the sheet keeps moving at the speed the finger left it.
 */
const SPRING = { damping: 34, stiffness: 300, mass: 1, overshootClamping: true } as const;

// ─── Floating artwork ───────────────────────────────────────────────────────
// Rendered once at full size and moved with transforms only (no layout per frame).

function FloatingArtwork({ progress, scrollY, seed, hymnalId, hideWhenOpen }: { progress: SharedValue<number>; scrollY: SharedValue<number>; seed: string; hymnalId?: string; hideWhenOpen: boolean }) {
  // 1 in Listen, 0 in the other modes: fades with the mode's content instead of popping.
  const modeShown = useSharedValue(hideWhenOpen ? 0 : 1);
  useEffect(() => {
    modeShown.value = withTiming(hideWhenOpen ? 0 : 1, { duration: FADE_MS, easing: EASE_OUT });
  }, [hideWhenOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const size = interpolate(p, [0, 1], [MINI_ART_SIZE, FULL_ART_SIZE], Extrapolation.CLAMP);
    const left = interpolate(p, [0, 1], [MINI_ART_LEFT, FULL_ART_LEFT], Extrapolation.CLAMP);
    const top = interpolate(p, [0, 1], [MINI_ART_TOP, FULL_ART_TOP], Extrapolation.CLAMP);
    const scale = size / FULL_ART_SIZE;
    const radius = interpolate(p, [0, 1], [MINI_ART_RADIUS, FULL_ART_RADIUS], Extrapolation.CLAMP);
    // Open sheet: scroll with the Listen view's content (only when open, so the mini bar never moves),
    // fading out before it would slide over the top bar.
    const y = Math.max(0, scrollY.value) * p;
    const scrolledAway = interpolate(y, [FULL_ART_SIZE * 0.35, FULL_ART_SIZE * 0.75], [1, 0], Extrapolation.CLAMP);
    return {
      transform: [
        // Scale is around the centre, so shift so the top-left lands on (left, top).
        { translateX: left - FULL_ART_LEFT + (size - FULL_ART_SIZE) / 2 },
        { translateY: top - FULL_ART_TOP + (size - FULL_ART_SIZE) / 2 - y },
        { scale },
      ],
      borderRadius: radius / scale,
      // The mini bar always shows it; in the open sheet only Listen does.
      opacity: (1 - interpolate(p, [0, 0.35], [0, 1], Extrapolation.CLAMP) * (1 - modeShown.value)) * scrolledAway,
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.art, style]}>
      {/* Drawn at full size and scaled down for the mini bar, so the mark isn't capped: it keeps the same
          share of the art (about 20 pt in the 40 pt mini art instead of 11). */}
      <HymnArt seed={seed} hymnalId={hymnalId} size={FULL_ART_SIZE} radius={0} markScale={0.5} markMax={Infinity} />
    </Animated.View>
  );
}

// ─── Player sheet ───────────────────────────────────────────────────────────

export function PlayerModal() {
  const { isPlayerVisible, isExpanded, expandPlayer, collapsePlayer, currentHymn } = useAudio();
  const { viewMode } = useViewMode();
  const insets = useSafeAreaInsets();

  // Desktop web has a sidebar instead of the bottom tab bar, so the mini bar sits at the bottom of the window.
  const desktop = useIsDesktop();
  const miniTop = SCREEN_HEIGHT - (insets.bottom + (desktop ? 0 : TAB_BAR_HEIGHT) + MINI_OFFSET) - MiniPlayerHeight;
  const sheetTop = insets.top;
  const travel = miniTop - sheetTop; // how far the sheet moves between states

  /** 0 = mini player, 1 = full sheet. Driven by the finger while dragging. */
  const progress = useSharedValue(0);
  const artScrollY = useSharedValue(0);
  /** Where the sheet is heading, so a JS state update doesn't restart a gesture's spring. */
  const target = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const [open, setOpen] = useState(false);

  // Button taps (expandPlayer/collapsePlayer) animate here; gestures set `target` first.
  useEffect(() => {
    const desired = isExpanded ? 1 : 0;
    if (target.value !== desired) {
      target.value = desired;
      progress.value = withSpring(desired, SPRING);
    }
  }, [isExpanded]);

  // Touch handling follows the visual state, switching as the sheet crosses halfway.
  useAnimatedReaction(
    () => progress.value > 0.5,
    (isOpen, was) => {
      if (isOpen !== was) runOnJS(setOpen)(isOpen);
    },
  );

  const drag = useMemo(() => {
    const settle = (velocityY: number) => {
      "worklet";
      const v = -velocityY / travel; // progress units per second
      const p = progress.value;
      const to = v > 0.6 ? 1 : v < -0.6 ? 0 : p > 0.5 ? 1 : 0;
      target.value = to;
      progress.value = withSpring(to, { ...SPRING, velocity: v });
      runOnJS(to ? expandPlayer : collapsePlayer)();
    };
    return Gesture.Pan()
      .activeOffsetY([-8, 8])
      .failOffsetX([-20, 20])
      .onBegin(() => {
        dragStart.value = progress.value;
      })
      .onUpdate((e) => {
        progress.value = Math.min(1, Math.max(0, dragStart.value - e.translationY / travel));
      })
      .onEnd((e) => settle(e.velocityY));
  }, [travel, expandPlayer, collapsePlayer]);

  // The sheet keeps its full-screen size and only slides: GPU transforms, no re-layout.
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [travel, 0], Extrapolation.CLAMP) }],
  }));
  const sheetBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15], [0, 1], Extrapolation.CLAMP),
  }));
  const fullContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 0.65], [0, 1], Extrapolation.CLAMP),
  }));
  const miniStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -travel], Extrapolation.CLAMP) }],
  }));

  if (!isPlayerVisible || !currentHymn) return null;

  return (
    <>
      {/* Mini player bar */}
      <Animated.View pointerEvents={open ? "none" : "auto"} style={[styles.mini, { top: miniTop }, miniStyle]}>
        <GestureDetector gesture={drag}>
          <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.miniBorder}>
            <View style={styles.miniInner}>
              <MiniPlayer onExpand={expandPlayer} />
            </View>
          </LinearGradient>
        </GestureDetector>
      </Animated.View>

      {/* Full sheet */}
      <Animated.View pointerEvents="box-none" style={[styles.sheet, { top: sheetTop, height: SCREEN_HEIGHT - sheetTop }, sheetStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheetBgStyle]}>
          <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.sheetBorder]}>
            <LinearGradient colors={[Palette.sheetTop, Palette.sheetTop, "#2E2318", Palette.sheetBottom]} style={styles.sheetFill} />
          </LinearGradient>
        </Animated.View>

        <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, fullContentStyle]}>
          <FullPlayer onClose={collapsePlayer} dragGesture={drag} artScrollY={artScrollY} />
        </Animated.View>

        <FloatingArtwork progress={progress} scrollY={artScrollY} seed={currentHymn.id} hymnalId={currentHymn.hymnalId} hideWhenOpen={viewMode !== "audio"} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  mini: { position: "absolute", left: H_INSET, right: H_INSET, height: MiniPlayerHeight },
  miniBorder: { flex: 1, borderRadius: 16, padding: 1 },
  miniInner: { flex: 1, borderRadius: 15, backgroundColor: Palette.surface, overflow: "hidden" },
  sheet: { position: "absolute", left: H_INSET, right: H_INSET },
  // The sheet runs into the bottom of the screen: rounded on top only, so content can scroll to the edge.
  sheetBorder: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 1, paddingHorizontal: 1 },
  sheetFill: { flex: 1, borderTopLeftRadius: 21, borderTopRightRadius: 21 },
  art: { position: "absolute", left: FULL_ART_LEFT, top: FULL_ART_TOP, width: FULL_ART_SIZE, height: FULL_ART_SIZE, overflow: "hidden" },
});
