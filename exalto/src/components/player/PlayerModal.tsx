import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  clamp,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FullPlayer } from "./FullPlayer";
import { MiniPlayer } from "./MiniPlayer";
import { useAudio } from "@/hooks/use-audio";
import { MiniPlayerHeight } from "@/constants/theme";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const TAB_BAR_HEIGHT = 49;
const MINI_BG = "#2A1F16";
const MINI_OFFSET = 10;

const SPRING_EXPAND = { damping: 20, stiffness: 260, mass: 0.9 };
const SPRING_COLLAPSE = { damping: 30, stiffness: 340, mass: 0.8 };

export function PlayerModal() {
  const { isPlayerVisible, isExpanded, expandPlayer, collapsePlayer } =
    useAudio();
  const insets = useSafeAreaInsets();

  const expandProgress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const [fullPlayerActive, setFullPlayerActive] = useState(false);

  const miniBottom = insets.bottom + TAB_BAR_HEIGHT + MINI_OFFSET;
  const miniTop = SCREEN_HEIGHT - miniBottom - MiniPlayerHeight;

  const dragDistance = useSharedValue(miniTop);
  useEffect(() => {
    dragDistance.value = miniTop;
  }, [miniTop]);

  const gestureProgress = useDerivedValue(() =>
    clamp(expandProgress.value - dragY.value / dragDistance.value, 0, 1),
  );

  useEffect(() => {
    if (isExpanded) {
      setFullPlayerActive(true);
      expandProgress.value = withSpring(1, SPRING_EXPAND);
    } else {
      expandProgress.value = withSpring(0, SPRING_COLLAPSE, (finished) => {
        if (finished) scheduleOnRN(setFullPlayerActive, false);
      });
    }
  }, [isExpanded]);

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      if (expandProgress.value > 0.5) {
        dragY.value = Math.max(0, e.translationY);
      }
    })
    .onEnd((e) => {
      const shouldCollapse =
        e.translationY > dragDistance.value * 0.3 || e.velocityY > 800;
      dragY.value = withSpring(0, SPRING_COLLAPSE);
      if (shouldCollapse) {
        expandProgress.value = withSpring(0, SPRING_COLLAPSE, (finished) => {
          if (finished) scheduleOnRN(collapsePlayer);
        });
      } else {
        expandProgress.value = withSpring(1, SPRING_EXPAND);
      }
    });

  const containerStyle = useAnimatedStyle(() => {
    const p = gestureProgress.value;
    return {
      top: interpolate(p, [0, 1], [miniTop, 0], Extrapolation.CLAMP),
      bottom: interpolate(p, [0, 1], [miniBottom, 0], Extrapolation.CLAMP),
      borderRadius: interpolate(p, [0, 0.5], [14, 0], Extrapolation.CLAMP),
    };
  });

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      gestureProgress.value,
      [0, 0.5],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const miniStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      gestureProgress.value,
      [0, 0.2],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const fullStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      gestureProgress.value,
      [0.25, 0.55],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  if (!isPlayerVisible) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Solid mini-player background */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.miniBg]} />

      {/* Gradient for full-player state — fades in on expand */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, gradientStyle]}>
        <LinearGradient
          colors={["#221A11", "#544028"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Mini player */}
      <Animated.View
        pointerEvents={fullPlayerActive ? "none" : "auto"}
        style={[StyleSheet.absoluteFill, miniStyle]}>
        <Pressable onPress={expandPlayer} style={StyleSheet.absoluteFill}>
          <MiniPlayer />
        </Pressable>
      </Animated.View>

      {/* Full player with swipe-to-dismiss */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          pointerEvents={fullPlayerActive ? "auto" : "none"}
          style={[StyleSheet.absoluteFill, fullStyle]}>
          <FullPlayer onClose={collapsePlayer} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  miniBg: {
    backgroundColor: MINI_BG,
  },
});
