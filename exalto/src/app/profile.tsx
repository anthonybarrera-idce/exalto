import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { AccentColor, AppBackground, BottomTabInset, MiniPlayerHeight, Spacing } from '@/constants/theme';
import { useAudio } from '@/hooks/use-audio';

export default function ProfileScreen() {
  const { isPlayerVisible } = useAudio();
  const [notifications, setNotifications] = useState(true);
  const [highQuality, setHighQuality] = useState(false);
  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight : 0) + Spacing.three;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={styles.screenTitle}>Profile</ThemedText>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
          {/* Avatar card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarLarge}>
              <ThemedText style={styles.avatarInitial}>A</ThemedText>
            </View>
            <View>
              <ThemedText style={styles.displayName}>Anthony Barrera</ThemedText>
              <ThemedText style={styles.email}>ozzy.barrera@cityofchildren.com</ThemedText>
            </View>
          </View>

          {/* Settings */}
          <ThemedText style={styles.sectionLabel}>Preferences</ThemedText>
          <View style={styles.settingsGroup}>
            <SettingRow icon="bell.fill" label="Notifications">
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#3A2C20', true: AccentColor }}
                thumbColor="#FFFFFF"
              />
            </SettingRow>
            <View style={styles.divider} />
            <SettingRow icon="hifispeaker.fill" label="High Quality Audio">
              <Switch
                value={highQuality}
                onValueChange={setHighQuality}
                trackColor={{ false: '#3A2C20', true: AccentColor }}
                thumbColor="#FFFFFF"
              />
            </SettingRow>
          </View>

          <ThemedText style={styles.sectionLabel}>Account</ThemedText>
          <View style={styles.settingsGroup}>
            <SettingRow icon="square.and.arrow.down" label="Downloads" chevron />
            <View style={styles.divider} />
            <SettingRow icon="trash.fill" label="Clear Cache" chevron />
          </View>

          <ThemedText style={styles.sectionLabel}>About</ThemedText>
          <View style={styles.settingsGroup}>
            <SettingRow icon="info.circle.fill" label="Version 1.0.0" />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  chevron,
  children,
}: {
  icon: string;
  label: string;
  chevron?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable style={styles.settingRow}>
      <SymbolView name={icon as any} size={18} tintColor={AccentColor} />
      <ThemedText style={styles.settingLabel}>{label}</ThemedText>
      {children ?? (chevron && <SymbolView name="chevron.right" size={14} tintColor="#55504A" />)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppBackground,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: '#2A1F16',
    borderRadius: 16,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  avatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  displayName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  email: {
    color: '#A09080',
    fontSize: 13,
    marginTop: 2,
  },
  sectionLabel: {
    color: '#A09080',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.two,
    marginTop: Spacing.two,
  },
  settingsGroup: {
    backgroundColor: '#2A1F16',
    borderRadius: 12,
    marginBottom: Spacing.three,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  settingLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#3A2C20',
    marginLeft: Spacing.three + 18 + Spacing.three,
  },
});
