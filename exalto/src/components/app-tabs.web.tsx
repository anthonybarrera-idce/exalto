import { BookOpen, Compass, House, ListMusic, type LucideIcon } from 'lucide-react-native';
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import type { ComponentRef, Ref } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { SIDEBAR_WIDTH, useIsDesktop } from '@/hooks/use-desktop';

/** Widest the screens get on desktop; wider windows centre them. */
const CONTENT_MAX_WIDTH = 1120;

const TABS: { name: string; href: '/' | '/hymns' | '/discover' | '/library'; Icon: LucideIcon; label: 'tabs.home' | 'tabs.hymns' | 'tabs.discover' | 'tabs.library' }[] = [
  { name: 'home', href: '/', Icon: House, label: 'tabs.home' },
  { name: 'hymns', href: '/hymns', Icon: BookOpen, label: 'tabs.hymns' },
  { name: 'discover', href: '/discover', Icon: Compass, label: 'tabs.discover' },
  { name: 'library', href: '/library', Icon: ListMusic, label: 'tabs.library' },
];

/**
 * Web stand-in for the native tab bar.
 * - Phone widths: the floating bottom bar from the Figma screens.
 * - Desktop (≥ DESKTOP_MIN_WIDTH): a sidebar on the left with labels, and the screens centred beside it.
 */
export default function AppTabs() {
  const { t } = useLocale();
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <Tabs style={styles.desktopRoot}>
        <TabList asChild>
          <Sidebar>
            {TABS.map((tab) => (
              <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
                <SidebarButton Icon={tab.Icon} label={t(tab.label)} />
              </TabTrigger>
            ))}
          </Sidebar>
        </TabList>
        <View style={styles.desktopMain}>
          {/* Each tab screen animates itself on focus (withTabTransition), same as with the native tabs. */}
          <TabSlot style={styles.desktopSlot} />
        </View>
      </Tabs>
    );
  }

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <IconTabButton Icon={tab.Icon} label={t(tab.label)} />
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function IconTabButton({ Icon, label, isFocused, ref, ...props }: TabTriggerSlotProps & { Icon: LucideIcon; label: string }) {
  // expo-router still types this ref as the View component, not the instance RN 0.88's strict types expect.
  return (
    <Pressable {...props} ref={ref as unknown as Ref<ComponentRef<typeof Pressable>>} accessibilityLabel={label} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <Icon size={24} color={isFocused ? Palette.cyan : Palette.amber} strokeWidth={1.8} />
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.container}>
      <View style={styles.bar}>{props.children}</View>
    </View>
  );
}

function Sidebar(props: TabListProps) {
  return (
    <View {...props} style={styles.sidebar}>
      <View style={styles.brand}>
        <Image source={require('@/assets/images/Exalto-Logo.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Exalto" />
        <ThemedText style={styles.brandText}>EXALTO</ThemedText>
      </View>
      <View style={styles.nav}>{props.children}</View>
    </View>
  );
}

function SidebarButton({ Icon, label, isFocused, ref, ...props }: TabTriggerSlotProps & { Icon: LucideIcon; label: string }) {
  return (
    <Pressable
      {...props}
      ref={ref as unknown as Ref<ComponentRef<typeof Pressable>>}
      accessibilityLabel={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.navItem,
        isFocused && styles.navItemActive,
        !isFocused && hovered && styles.navItemHover,
        pressed && styles.pressed,
      ]}>
      <Icon size={22} color={isFocused ? Palette.cyan : Palette.amber} strokeWidth={1.8} />
      <ThemedText style={[styles.navLabel, isFocused && styles.navLabelActive]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, width: '100%', paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 56,
    borderRadius: 18,
    backgroundColor: '#1F1710',
    borderWidth: 1,
    borderColor: Palette.surface2,
    paddingHorizontal: Spacing.five,
  },
  tabButton: { padding: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },

  desktopRoot: { flex: 1, flexDirection: 'row' },
  desktopMain: { flex: 1, height: '100%', alignItems: 'center' },
  desktopSlot: { flex: 1, height: '100%', width: '100%', maxWidth: CONTENT_MAX_WIDTH },
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: '#150E07',
    borderRightWidth: 1,
    borderRightColor: Palette.surface2,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.two },
  brandLogo: { width: 30, height: 36 },
  brandText: { color: Palette.text, fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: 4 },
  nav: { gap: Spacing.one },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 11, borderRadius: 12 },
  navItemActive: { backgroundColor: Palette.surface2 },
  navItemHover: { backgroundColor: Palette.surface },
  navLabel: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  navLabelActive: { color: Palette.cyan },
});
