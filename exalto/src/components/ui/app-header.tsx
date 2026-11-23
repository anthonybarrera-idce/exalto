import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { SettingsSheet } from '@/components/SettingsSheet';
import { useLocale } from '@/context/locale-context';

import { ThemedText } from '@/components/themed-text';
import { BrandGradient, Palette, Spacing } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

/** Top bar from the Figma screens: logo, optional page title, search and avatar. */
export function AppHeader({ title, onSearch, initials = 'A' }: { title?: string; onSearch?: () => void; initials?: string }) {
  const { t } = useLocale();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <View style={styles.row}>
      <Image source={require('@/assets/images/Exalto-Logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Exalto" />
      {title ? <ThemedText style={styles.title}>{title}</ThemedText> : <View style={styles.flex} />}
      {onSearch && (
        <Pressable onPress={onSearch} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('header.search')}>
          <Search size={24} color={Palette.text} strokeWidth={1.8} />
        </Pressable>
      )}
      <Pressable onPress={() => setSettingsOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('header.settings')}>
        <LinearGradient colors={[BrandGradient[1], '#C0563A']} style={styles.avatar}>
          <ThemedText style={styles.avatarText}>{initials}</ThemedText>
        </LinearGradient>
      </Pressable>
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  logo: { width: 34, height: 40 },
  title: { flex: 1, color: Palette.text, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  flex: { flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Palette.bg, fontSize: 15, lineHeight: 20, fontWeight: '800' },
});
