import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BookOpen, FileMusic, Headphones } from 'lucide-react-native';
import { useEffect, useRef } from 'react';

import { useViewMode, type ViewMode } from '@/context/view-mode-context';
import { useLocale } from '@/context/locale-context';
import { Palette } from '@/constants/theme';

// Figma: tan pill with a light-amber knob; icons in dark brown.
const ICON_ON = '#3A2410';
const ICON_OFF = '#5C4128';

const SPRING = { damping: 18, stiffness: 280, mass: 0.7 };
const OPTION_W = 44;
const PILL_H = 40;
/** Outer height including the shell border, so callers can keep their row height when the pill is hidden. */
export const MODE_SWITCHER_HEIGHT = PILL_H + 2;

const OPTIONS = {
  hymnal: { Icon: BookOpen, label: 'mode.read' },
  audio: { Icon: Headphones, label: 'mode.listen' },
  practice: { Icon: FileMusic, label: 'practice.open' },
} as const;

interface ModeSwitcherProps {
  variant?: 'floating' | 'inline';
  bottom?: number;
  /**
   * The modes to offer, in order. Defaults to Read and Listen (the hymn list's global choice).
   * With one mode or none there's nothing to switch, so the pill isn't shown.
   */
  modes?: ViewMode[];
}

const DEFAULT_MODES: ViewMode[] = ['hymnal', 'audio'];

export function ModeSwitcher({ variant = 'floating', bottom = 0, modes = DEFAULT_MODES }: ModeSwitcherProps) {
  const { viewMode, setViewMode } = useViewMode();
  const { t } = useLocale();
  // A mode that isn't offered shows as the first one offered (the player switches to it right after).
  const shown = modes.includes(viewMode) ? viewMode : modes[0];
  const index = Math.max(0, modes.indexOf(shown));
  const modesKey = modes.join(',');
  const slideX = useSharedValue(index * OPTION_W);
  const lastKey = useRef(modesKey);

  useEffect(() => {
    if (lastKey.current !== modesKey) {
      // A different hymn with a different set of options: the pill resizes, so put the knob
      // straight on its new spot instead of sliding across options that just changed.
      lastKey.current = modesKey;
      slideX.value = index * OPTION_W;
    } else {
      slideX.value = withSpring(index * OPTION_W, SPRING);
    }
  }, [index, modesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  if (modes.length < 2) return null;

  // Border lives on the outer shell so overflow:hidden on the inner clip
  // never swallows it on any platform.
  const pill = (
    <View style={styles.pillShell}>
      <View style={[styles.pillInner, { width: OPTION_W * modes.length }]}>
        <Animated.View style={[styles.knob, knobStyle]} />
        {modes.map((mode) => {
          const { Icon, label } = OPTIONS[mode];
          const on = shown === mode;
          return (
            <Pressable key={mode} style={styles.option} onPress={() => setViewMode(mode)} hitSlop={4} accessibilityRole="button" accessibilityLabel={t(label)} accessibilityState={{ selected: on }}>
              <Icon size={18} strokeWidth={1.8} color={on ? ICON_ON : ICON_OFF} />
            </Pressable>
          );
        })}
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
