import { Mic, Piano } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import type { SoundStyle } from '@/context/audio-context';
import { useLocale } from '@/context/locale-context';
import type { StringKey } from '@/i18n/strings';
import { useAudio } from '@/hooks/use-audio';

const STYLES: { value: SoundStyle; label: StringKey; Icon: typeof Piano }[] = [
  { value: 'piano', label: 'player.piano', Icon: Piano },
  { value: 'acapella', label: 'player.acapella', Icon: Mic },
];

/** Piano / A cappella switch for the hymn's recording. Hidden unless the hymn has an a cappella recording. */
export function SoundStyleToggle() {
  const { currentHymn, activeSoundStyle, setSoundStyle } = useAudio();
  const { t } = useLocale();
  if (!currentHymn?.acapellaUri || !currentHymn.audioUri) return null;

  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={t('player.recording')}>
      {STYLES.map(({ value, label, Icon }) => {
        const selected = activeSoundStyle === value;
        return (
          <Pressable
            key={value}
            onPress={() => setSoundStyle(value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentOn]}>
            <Icon size={14} color={selected ? Palette.bg : Palette.text} />
            <ThemedText style={[styles.label, selected && { color: Palette.bg }]}>{t(label)}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: Palette.pill, borderRadius: 999, padding: 3, gap: 2, alignSelf: 'center' },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  segmentOn: { backgroundColor: Palette.amber },
  label: { fontSize: 13, fontWeight: '600' },
});
