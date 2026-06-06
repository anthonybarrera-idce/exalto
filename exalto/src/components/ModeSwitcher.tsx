import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';

import { useViewMode } from '@/context/view-mode-context';
import { AccentColor } from '@/constants/theme';

const SPRING = { damping: 18, stiffness: 280, mass: 0.7 };
const PILL_W = 88;
const PILL_H = 40;
const OPTION_W = PILL_W / 2;

interface ModeSwitcherProps {
  variant?: 'floating' | 'inline';
  bottom?: number;
}

export function ModeSwitcher({ variant = 'floating', bottom = 0 }: ModeSwitcherProps) {
  const { viewMode, setViewMode } = useViewMode();
  const slideX = useSharedValue(viewMode === 'audio' ? OPTION_W : 0);

  useEffect(() => {
    slideX.value = withSpring(viewMode === 'audio' ? OPTION_W : 0, SPRING);
  }, [viewMode]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  // Border lives on the outer shell so overflow:hidden on the inner clip
  // never swallows it on any platform.
  const pill = (
    <View style={styles.pillShell}>
      <View style={styles.pillInner}>
        <Animated.View style={[styles.knob, knobStyle]} />
        <Pressable style={styles.option} onPress={() => setViewMode('hymnal')} hitSlop={4}>
          <SymbolView
            name="book.closed.fill"
            size={17}
            tintColor={viewMode === 'hymnal' ? '#FFFFFF' : '#7A6A5A'}
          />
        </Pressable>
        <Pressable style={styles.option} onPress={() => setViewMode('audio')} hitSlop={4}>
          <SymbolView
            name="headphones"
            size={17}
            tintColor={viewMode === 'audio' ? '#FFFFFF' : '#7A6A5A'}
          />
        </Pressable>
      </View>
    </View>
  );

  if (variant === 'inline') return pill;

  return <View style={[styles.floatingWrapper, { bottom }]}>{pill}</View>;
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    right: 16,
  },
  // Outer shell: owns border + corner rounding
  pillShell: {
    borderRadius: PILL_H / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  // Inner: clips the sliding knob to the pill shape
  pillInner: {
    width: PILL_W,
    height: PILL_H,
    borderRadius: PILL_H / 2 - 1,
    backgroundColor: '#2A1F16',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  knob: {
    position: 'absolute',
    width: OPTION_W,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    backgroundColor: AccentColor,
  },
  option: {
    width: OPTION_W,
    height: PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
