import { BookOpen, House, ListMusic, type LucideIcon } from 'lucide-react-native';
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Palette, Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';

// Web stand-in for the native tab bar: the floating bar from the Figma screens.
export default function AppTabs() {
  const { t } = useLocale();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <IconTabButton Icon={House} label={t('tabs.home')} />
          </TabTrigger>
          <TabTrigger name="hymns" href="/hymns" asChild>
            <IconTabButton Icon={BookOpen} label={t('tabs.hymns')} />
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <IconTabButton Icon={ListMusic} label={t('tabs.library')} />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function IconTabButton({ Icon, label, isFocused, ...props }: TabTriggerSlotProps & { Icon: LucideIcon; label: string }) {
  return (
    <Pressable {...props} accessibilityLabel={label} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
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
});
