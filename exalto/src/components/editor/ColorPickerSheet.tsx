import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import ColorPicker, { HueSlider, InputWidget, Panel1, type ColorFormatsObject } from 'reanimated-color-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { HymnArt } from '@/components/ui/hymn-art';
import { useSheetEntering } from '@/components/ui/transitions';
import { Palette } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';

/**
 * Full color picker for a hymnal (saturation/brightness square, hue slider, hex field), with the hymn art the
 * color produces as a live preview. Nothing changes until Done.
 */
export function ColorPickerSheet({ visible, value, onDone, onClose }: { visible: boolean; value: string; onDone: (hex: string) => void; onClose: () => void }) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const sheetEntering = useSheetEntering();
  const [color, setColor] = useState(value);
  const [opened, setOpened] = useState(value);
  // Start from the hymnal's current color each time the sheet opens.
  if (visible && opened !== value) {
    setOpened(value);
    setColor(value);
  }

  return (
    // The backdrop fades while the sheet rises (a "slide" Modal moved the dim backdrop up with it).
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Gestures inside a Modal need their own root on Android. */}
      <GestureHandlerRootView style={styles.flex}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('search.cancel')} />
        <Animated.View entering={sheetEntering} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <ThemedText style={styles.cancel}>{t('search.cancel')}</ThemedText>
            </Pressable>
            <ThemedText style={styles.title}>{t('hymnalEdit.customColor')}</ThemedText>
            <Pressable onPress={() => onDone(color)} hitSlop={10} accessibilityRole="button">
              <ThemedText style={styles.done}>{t('settings.done')}</ThemedText>
            </Pressable>
          </View>

          <View style={styles.previewRow}>
            <HymnArt seed="preview" color={color} size={72} radius={14} />
            <HymnArt seed="preview" color={color} size={44} radius={8} label="12" />
          </View>

          <ColorPicker
            value={value}
            onChangeJS={(c: ColorFormatsObject) => setColor(c.hex.slice(0, 7).toUpperCase())}
            thumbSize={26}
            sliderThickness={26}
            boundedThumb
            style={styles.picker}
          >
            <Panel1 style={styles.panel} />
            <HueSlider style={styles.hue} />
            <InputWidget
              defaultFormat="HEX"
              formats={['HEX']}
              disableAlphaChannel
              inputStyle={styles.input}
              inputTitleStyle={styles.inputTitle}
              iconColor={Palette.muted}
            />
          </ColorPicker>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: Palette.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 22, paddingTop: 16, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  cancel: { color: Palette.muted, fontSize: 16, lineHeight: 22 },
  done: { color: Palette.cyan, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  previewRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  picker: { gap: 16 },
  panel: { height: 200, borderRadius: 14 },
  hue: { borderRadius: 13 },
  input: { color: Palette.text, borderColor: Palette.line, backgroundColor: Palette.bg, fontSize: 15 },
  inputTitle: { color: Palette.muted },
});
