import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BookOpen, FileMusic, Headphones } from 'lucide-react-native';
import { useEffect } from 'react';

import { useViewMode } from '@/context/view-mode-context';
import { useLocale } from '@/context/locale-context';
import { Palette } from '@/constants/theme';

// Figma: tan pill with a light-amber knob; icons in dark brown.
const ICON_ON = '#3A2410';
const ICON_OFF = '#5C4128';

const SPRING = { damping: 18, stiffness: 280, mass: 0.7 };
const OPTION_W = 44;
const PILL_H = 40;

interface ModeSwitcherProps {
  variant?: 'floating' | 'inline';
  bottom?: number;
  /** Offer the third option, the voices practice tool (full player, hymns with practice notes). */
  practice?: boolean;
}

export function ModeSwitcher({ variant = 'floating', bottom = 0, practice = false }: ModeSwitcherProps) {
  const { viewMode, setViewMode } = useViewMode();
  const { t } = useLocale();
  // Without the practice option, 'practice' shows as listening.
  const shown = viewMode === 'practice' && !practice ? 'audio' : viewMode;
  const index = shown === 'hymnal' ? 0 : shown === 'audio' ? 1 : 2;
  const slideX = useSharedValue(index * OPTION_W);

  useEffect(() => {
    slideX.value = withSpring(index * OPTION_W, SPRING);
  }, [index]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  // Border lives on the outer shell so overflow:hidden on the inner clip
  // never swallows it on any platform.
  const pill = (
    <View style={styles.pillShell}>
      <View style={[styles.pillInner, { width: OPTION_W * (practice ? 3 : 2) }]}>
        <Animated.View style={[styles.knob, knobStyle]} />
        <Pressable style={styles.option} onPress={() => setViewMode('hymnal')} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('mode.read')} accessibilityState={{ selected: shown === 'hymnal' }}>
          <BookOpen size={18} strokeWidth={1.8} color={shown === 'hymnal' ? ICON_ON : ICON_OFF} />
        </Pressable>
        <Pressable style={styles.option} onPress={() => setViewMode('audio')} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('mode.listen')} accessibilityState={{ selected: shown === 'audio' }}>
          <Headphones size={18} strokeWidth={1.8} color={shown === 'audio' ? ICON_ON : ICON_OFF} />
        </Pressable>
        {practice ? (
          <Pressable style={styles.option} onPress={() => setViewMode('practice')} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('practice.open')} accessibilityState={{ selected: shown === 'practice' }}>
            <FileMusic size={18} strokeWidth={1.8} color={shown === 'practice' ? ICON_ON : ICON_OFF} />
          </Pressable>
        ) : null}
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
    borderColor: 'rgba(245,192,128,0.35)',
  },
  // Inner: clips the sliding knob to the pill shape
  pillInner: {
    height: PILL_H,
    borderRadius: PILL_H / 2 - 1,
    backgroundColor: '#B98A5A',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  knob: {
    position: 'absolute',
    width: OPTION_W,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    backgroundColor: Palette.amber,
  },
  option: {
    width: OPTION_W,
    height: PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
