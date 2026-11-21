import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FontFamily } from '@/constants/theme';

const PALETTES: readonly (readonly [string, string, string])[] = [
  ['#0F6F95', '#04C1FF', '#EDA145'],
  ['#7A2E38', '#E0455B', '#F5A06B'],
  ['#1B4D5C', '#3FA7B5', '#F5C080'],
  ['#4A2E6B', '#B0548F', '#F5A06B'],
  ['#5C3A1E', '#C7843E', '#F5C080'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Generated artwork for hymns without a cover image: a warm gradient keyed to the hymn id. */
export function HymnArt({ seed, size = 48, radius = 10, label, style }: { seed: string; size?: number; radius?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const colors = PALETTES[hash(seed) % PALETTES.length];
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {label != null && (
        <View style={styles.center}>
          <Text style={[styles.label, { fontSize: Math.max(11, size * 0.3) }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  label: { color: 'rgba(255,255,255,0.9)', fontFamily: FontFamily.extrabold },
});
