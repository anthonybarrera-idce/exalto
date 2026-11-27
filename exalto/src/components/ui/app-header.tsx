import { Search, UserRound } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/account/ui';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useIsDesktop } from '@/hooks/use-desktop';

import { ThemedText } from '@/components/themed-text';
import { BrandGradient, Palette, Spacing } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

/** Top bar from the Figma screens: logo, optional page title, search and avatar (opens account and settings). */
export function AppHeader({ title, onSearch }: { title?: string; onSearch?: () => void }) {
  const { t } = useLocale();
  const { user, profile, openAccount } = useAuth();
  const name = profile?.displayName || user?.displayName || user?.email || '';
  const desktop = useIsDesktop();
  return (
    <View style={styles.row}>
      {/* The desktop web sidebar already shows the logo. */}
      {!desktop && <Image source={require('@/assets/images/Exalto-Logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Exalto" />}
      {title ? <ThemedText style={styles.title}>{title}</ThemedText> : <View style={styles.flex} />}
      {onSearch && (
        <Pressable onPress={onSearch} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('header.search')}>
          <Search size={24} color={Palette.text} strokeWidth={1.8} />
        </Pressable>
      )}
      <Pressable onPress={() => openAccount()} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('account.avatar')}>
        {user ? (
          <Avatar name={name} photoURL={profile?.photoURL ?? user.photoURL} size={40} />
        ) : (
          <LinearGradient colors={['#7FDCFF', Palette.cyan, '#0F6F95']} start={{ x: 0.2, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={styles.avatar}>
            <UserRound size={20} color={Palette.bg} strokeWidth={2.2} />
          </LinearGradient>
        )}
      </Pressable>
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
