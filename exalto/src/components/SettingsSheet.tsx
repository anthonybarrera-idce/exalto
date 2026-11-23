import Constants from 'expo-constants';
import { Check, Globe, Info } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { type LanguagePreference, useLocale } from '@/context/locale-context';

const OPTIONS: { value: LanguagePreference; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, preference, setPreference } = useLocale();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>{t('settings.title')}</ThemedText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <ThemedText style={styles.done}>{t('settings.done')}</ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.sectionHead}>
            <Globe size={18} color={Palette.amber} />
            <ThemedText style={styles.sectionTitle}>{t('settings.language')}</ThemedText>
          </View>
          <View style={styles.group} accessibilityRole="radiogroup">
            {[{ value: 'system' as const, label: t('settings.system') }, ...OPTIONS].map((o, i) => {
              const on = preference === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setPreference(o.value)}
                  style={[styles.option, i > 0 && styles.divider]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}>
                  <ThemedText style={styles.optionText}>{o.label}</ThemedText>
                  {on && <Check size={20} color={Palette.cyan} strokeWidth={2.4} />}
                </Pressable>
              );
            })}
          </View>
          <ThemedText style={styles.hint}>{t('settings.languageHint')}</ThemedText>

          <View style={[styles.sectionHead, { marginTop: Spacing.four }]}>
            <Info size={18} color={Palette.amber} />
            <ThemedText style={styles.sectionTitle}>{t('settings.about')}</ThemedText>
          </View>
          <View style={styles.group}>
            <View style={styles.option}>
              <ThemedText style={styles.optionText}>Exalto</ThemedText>
              <ThemedText style={styles.hint}>{t('settings.version', { version })}</ThemedText>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.four },
  title: { color: Palette.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  done: { color: Palette.cyan, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  content: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  group: { backgroundColor: Palette.surface, borderRadius: 14, borderWidth: 1, borderColor: Palette.line },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: Spacing.three },
  divider: { borderTopWidth: 1, borderTopColor: Palette.line },
  optionText: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  hint: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
});
