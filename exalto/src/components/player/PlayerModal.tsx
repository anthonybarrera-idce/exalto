import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  clamp,
  Easing,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FullPlayer } from "./FullPlayer";
import { MiniPlayer } from "./MiniPlayer";
import { useAudio } from "@/hooks/use-audio";
import { useViewMode } from "@/context/view-mode-context";
import { AccentColor, MiniPlayerHeight, Spacing } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const TAB_BAR_HEIGHT = 49;
const MINI_BG = "#2A1F16";
const MINI_OFFSET = 10;
const HEADER_CLEARANCE = 0;

// Artwork dimensions in each state
const MINI_ART_SIZE = 40;
const MINI_ART_TOP = (MiniPlayerHeight - MINI_ART_SIZE) / 2; // vertically centred in mini bar
const MINI_ART_LEFT = Spacing.three; // matches MiniPlayer paddingHorizontal
const MINI_ART_RADIUS = 8;

const FULL_ART_SIZE = SCREEN_WIDTH - 68; // matches ARTWORK_SIZE in FullPlayer
const FULL_ART_TOP = Spacing.two + 20 + 56; // paddingTop + dragHandle + topBar = 84
const FULL_ART_LEFT = Spacing.four; // matches FullPlayer paddingHorizontal
const FULL_ART_RADIUS = 16;

// Smooth ease curves — no spring bounce
const EASE_OUT = Easing.bezier(0.4, 0, 0.2, 1); // expand
const EASE_IN = Easing.bezier(0.4, 0, 0.6, 1);  // collapse
const DURATION_EXPAND = 380;
const DURATION_COLLAPSE = 280;

function timing(to: number, expand: boolean, cb?: (finished?: boolean) => void) {
  "worklet";
  return withTiming(
    to,
    { duration: expand ? DURATION_EXPAND : DURATION_COLLAPSE, easing: expand ? EASE_OUT : EASE_IN },
    cb,
  );
}

// ─── Floating artwork ───────────────────────────────────────────────────────

interface FloatingArtworkProps {
  gestureProgress: SharedValue<number>;
  color: string;
  hidden: boolean;
}

function FloatingArtwork({ gestureProgress, color, hidden }: FloatingArtworkProps) {
  const artStyle = useAnimatedStyle(() => {
    const p = gestureProgress.value;
    const size = interpolate(p, [0, 1], [MINI_ART_SIZE, FULL_ART_SIZE], Extrapolation.CLAMP);
    return {
      position: "absolute",
      width: size,
      height: size,
      top: interpolate(p, [0, 1], [MINI_ART_TOP, FULL_ART_TOP], Extrapolation.CLAMP),
      left: interpolate(p, [0, 1], [MINI_ART_LEFT, FULL_ART_LEFT], Extrapolation.CLAMP),
      borderRadius: interpolate(p, [0, 1], [MINI_ART_RADIUS, FULL_ART_RADIUS], Extrapolation.CLAMP),
      opacity: hidden ? 0 : 1,
      backgroundColor: color,
    };
  });

  return <Animated.View pointerEvents="none" style={artStyle} />;
}

// ─── Main modal ─────────────────────────────────────────────────────────────

export function PlayerModal() {
  const { isPlayerVisible, isExpanded, expandPlayer, collapsePlayer, currentHymn } = useAudio();
  const { viewMode } = useViewMode();
  const insets = useSafeAreaInsets();

  const expandProgress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const [fullPlayerActive, setFullPlayerActive] = useState(false);

  const miniBottom = insets.bottom + TAB_BAR_HEIGHT + MINI_OFFSET;
  const miniTop = SCREEN_HEIGHT - miniBottom - MiniPlayerHeight;
  const expandedTop = insets.top + HEADER_CLEARANCE;
  const dragDistance = useSharedValue(miniTop - expandedTop);

  useEffect(() => {
    dragDistance.value = miniTop - expandedTop;
  }, [miniTop, expandedTop]);

  const gestureProgress = useDerivedValue(() =>
    clamp(expandProgress.value - dragY.value / dragDistance.value, 0, 1),
  );

  useEffect(() => {
    if (isExpanded) {
      setFullPlayerActive(true);
      expandProgress.value = timing(1, true);
    } else {
      expandProgress.value = timing(0, false, (finished) => {
        "worklet";
        if (finished) runOnJS(setFullPlayerActive)(false);
      });
    }
  }, [isExpanded]);

  const panGesture = Gesture.Pan()
    .enabled(fullPlayerActive)
    .minDistance(10)
    .onUpdate((e) => {
      if (expandProgress.value > 0.5) {
        dragY.value = Math.max(0, e.translationY);
      }
    })
    .onEnd((e) => {
      const shouldCollapse =
        e.translationY > dragDistance.value * 0.3 || e.velocityY > 800;
      dragY.value = timing(0, false);
      if (shouldCollapse) {
        expandProgress.value = timing(0, false, (finished) => {
          "worklet";
          if (finished) runOnJS(collapsePlayer)();
        });
      } else {
        expandProgress.value = timing(1, true);
      }
    });

  const containerStyle = useAnimatedStyle(() => {
    const p = gestureProgress.value;
    const radius = interpolate(p, [0, 1], [14, 20], Extrapolation.CLAMP);
    return {
      top: interpolate(p, [0, 1], [miniTop, expandedTop], Extrapolation.CLAMP),
      bottom: interpolate(p, [0, 1], [miniBottom, H_INSET], Extrapolation.CLAMP),
      borderTopLeftRadius: radius,
      borderTopRightRadius: radius,
      borderBottomLeftRadius: radius,
      borderBottomRightRadius: radius,
    };
  });

  const gradientBorderStyle = useAnimatedStyle(() => {
    const p = gestureProgress.value;
    const radius = interpolate(p, [0, 1], [14, 20], Extrapolation.CLAMP);
    return {
      top: interpolate(p, [0, 1], [miniTop, expandedTop], Extrapolation.CLAMP) - 1,
      bottom: interpolate(p, [0, 1], [miniBottom, H_INSET], Extrapolation.CLAMP) - 1,
      borderTopLeftRadius: radius + 1,
      borderTopRightRadius: radius + 1,
      borderBottomLeftRadius: radius + 1,
      borderBottomRightRadius: radius + 1,
    };
  });

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(gestureProgress.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
  }));

  const miniStyle = useAnimatedStyle(() => ({
    opacity: interpolate(gestureProgress.value, [0, 0.2], [1, 0], Extrapolation.CLAMP),
  }));

  const fullStyle = useAnimatedStyle(() => ({
    opacity: interpolate(gestureProgress.value, [0.25, 0.55], [0, 1], Extrapolation.CLAMP),
  }));

  if (!isPlayerVisible) return null;

  // Artwork travels between mini and full — hide it in hymnal mode once expanded
  const artworkHidden = fullPlayerActive && viewMode === "hymnal";
  const artworkColor = currentHymn?.artworkColor ?? AccentColor;

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.gradientBorder, gradientBorderStyle]}>
        <LinearGradient
          colors={["#04C1FF", "#EEA246"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Solid mini-player background */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.miniBg]} />

      {/* Gradient for full-player state */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, gradientStyle]}>
        <LinearGradient
          colors={["#241B12", "#241B12", "#2E2318", "#3C2E1E"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Mini player (placeholder artwork hidden — floating artwork covers it) */}
      <Animated.View
        pointerEvents={fullPlayerActive ? "none" : "auto"}
        style={[StyleSheet.absoluteFill, miniStyle]}>
        <Pressable onPress={expandPlayer} style={StyleSheet.absoluteFill}>
          <MiniPlayer />
        </Pressable>
      </Animated.View>

      {/* Full player (placeholder artwork hidden — floating artwork covers it) */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          pointerEvents={fullPlayerActive ? "auto" : "none"}
          style={[StyleSheet.absoluteFill, fullStyle]}>
          <FullPlayer onClose={collapsePlayer} />
        </Animated.View>
      </GestureDetector>

      {/* Floating artwork — animates between mini and full positions */}
      <FloatingArtwork
        gestureProgress={gestureProgress}
        color={artworkColor}
        hidden={artworkHidden}
      />
    </Animated.View>
    </>
  );
}

const H_INSET = 10;

const styles = StyleSheet.create({
  gradientBorder: {
    position: "absolute",
    left: H_INSET - 1,
    right: H_INSET - 1,
    overflow: "hidden",
  },
  container: {
    position: "absolute",
    left: H_INSET,
    right: H_INSET,
    overflow: "hidden",
  },
  miniBg: {
    backgroundColor: MINI_BG,
  },
});
