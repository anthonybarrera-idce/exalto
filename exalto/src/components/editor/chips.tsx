import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

/** A row of selectable pills (single choice), scrolling sideways when there are many. */
export function Chips({ options, value, onChange }: { options: { value: string; label: string; color?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}>
            {o.color ? <View style={[styles.dot, { backgroundColor: o.color }]} /> : null}
            <ThemedText style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Palette.pill },
  chipOn: { backgroundColor: Palette.cyan },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600', maxWidth: 200 },
  textOn: { color: '#04131B' },
});
