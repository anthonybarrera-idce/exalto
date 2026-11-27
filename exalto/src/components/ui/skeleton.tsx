import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Palette, Spacing } from '@/constants/theme';

/**
 * Placeholder blocks shown while content loads. They pulse gently (a Reanimated CSS animation, so it runs on the
 * UI thread natively and as CSS keyframes on web); with Reduce Motion on they stay still.
 */
export function Skeleton({ width, height, radius = 8, style }: { width?: DimensionValue; height: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  return <Animated.View style={[styles.block, { width, height, borderRadius: radius }, reduceMotion ? null : PULSE, style]} />;
}

/** Matches a 140px hymn tile: square art, then title and subtitle lines. */
export function SkeletonTile() {
  return (
    <View style={styles.tile}>
      <Skeleton width={140} height={140} radius={16} />
      <View style={styles.tileText}>
        <Skeleton width="80%" height={14} />
        <Skeleton width="55%" height={10} />
      </View>
    </View>
  );
}

/** Matches a chart row: 56px art, two text lines, and the heart. */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={56} height={56} radius={12} />
      <View style={styles.rowText}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="40%" height={10} />
      </View>
      <Skeleton width={24} height={24} radius={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: Palette.surface2 },
  tile: { width: 140, gap: Spacing.two },
  tileText: { paddingHorizontal: Spacing.two, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three + 4 },
  rowText: { flex: 1, gap: 8 },
});

// Kept out of StyleSheet.create: react-native-web's validator rejects `animationName`.
const PULSE = {
  animationName: { from: { opacity: 1 }, to: { opacity: 0.45 } },
  animationDuration: '900ms',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
} as const;
