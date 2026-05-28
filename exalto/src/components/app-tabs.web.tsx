import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, View, StyleSheet } from 'react-native';

import { AppBackground, Spacing } from '@/constants/theme';

const ACTIVE_TINT = '#FFFFFF';
const INACTIVE_TINT = '#55504A';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <IconTabButton icon="house.fill" />
          </TabTrigger>
          <TabTrigger name="hymns" href="/hymns" asChild>
            <IconTabButton icon="music.note.list" />
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <IconTabButton icon="books.vertical.fill" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <IconTabButton icon="person.circle.fill" />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function IconTabButton({ icon, isFocused, ...props }: TabTriggerSlotProps & { icon: string }) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <SymbolView
        name={icon as any}
        size={22}
        tintColor={isFocused ? ACTIVE_TINT : INACTIVE_TINT}
      />
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: AppBackground,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.two,
  },
  innerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
  },
  tabButton: {
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
