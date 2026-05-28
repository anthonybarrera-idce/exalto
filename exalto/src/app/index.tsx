import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useAudio } from '@/hooks/use-audio';
import { HYMN_OF_THE_DAY, HYMNS, POPULAR_HYMNS, RECENTLY_PLAYED } from '@/data/hymns';
import { Hymn } from '@/context/audio-context';
import { AccentColor, AppBackground, BottomTabInset, MiniPlayerHeight, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const { loadHymn, isPlayerVisible } = useAudio();

  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight : 0) + Spacing.three;

  function playHymn(hymn: Hymn) {
    loadHymn(hymn, HYMNS, HYMNS.indexOf(hymn));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.logo}>♪</ThemedText>
          <View style={styles.headerRight}>
            <Pressable hitSlop={8}>
              <SymbolView name="magnifyingglass" size={22} tintColor="#FFFFFF" />
            </Pressable>
            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>A</ThemedText>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}>
          {/* Greeting */}
          <ThemedText style={styles.greeting}>Hello, Anthony</ThemedText>

          {/* Hymn of the Day */}
          <Pressable
            style={[styles.featuredCard, { backgroundColor: HYMN_OF_THE_DAY.artworkColor }]}
            onPress={() => playHymn(HYMN_OF_THE_DAY)}>
            <View style={styles.featuredBadge}>
              <ThemedText style={styles.featuredBadgeText}>HYMN OF THE DAY</ThemedText>
            </View>
            <ThemedText style={styles.featuredTitle}>{HYMN_OF_THE_DAY.title}</ThemedText>
            <ThemedText style={styles.featuredArtist}>{HYMN_OF_THE_DAY.artist}</ThemedText>
            <View style={styles.featuredPlayButton}>
              <SymbolView name="play.fill" size={22} tintColor="#FFFFFF" />
            </View>
          </Pressable>

          {/* Recently Played */}
          <ThemedText style={styles.sectionTitle}>Recently Played</ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}>
            {RECENTLY_PLAYED.map((hymn) => (
              <Pressable
                key={hymn.id}
                onPress={() => playHymn(hymn)}
                style={styles.recentCard}>
                <View style={[styles.recentArtwork, { backgroundColor: hymn.artworkColor }]} />
                <ThemedText style={styles.recentTitle} numberOfLines={1}>
                  {hymn.title}
                </ThemedText>
                <ThemedText style={styles.recentArtist} numberOfLines={1}>
                  {hymn.artist}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          {/* Popular Chart */}
          <ThemedText style={styles.sectionTitle}>Popular Chart</ThemedText>
          <View style={styles.chartList}>
            {POPULAR_HYMNS.map((hymn, i) => (
              <View key={hymn.id} style={styles.chartRow}>
                <View style={[styles.chartArtwork, { backgroundColor: hymn.artworkColor }]}>
                  <ThemedText style={styles.chartNumber}>{i + 1}</ThemedText>
                </View>
                <View style={styles.chartInfo}>
                  <ThemedText style={styles.chartTitle} numberOfLines={1}>
                    {hymn.title}
                  </ThemedText>
                  <ThemedText style={styles.chartArtist} numberOfLines={1}>
                    {hymn.artist}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => playHymn(hymn)}
                  style={styles.chartPlayButton}>
                  <SymbolView name="play.fill" size={16} tintColor="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  greeting: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  featuredCard: {
    borderRadius: 16,
    padding: Spacing.four,
    height: 180,
    justifyContent: 'flex-end',
    position: 'relative',
    overflow: 'hidden',
  },
  featuredBadge: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  featuredBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  featuredArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  featuredPlayButton: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  horizontalList: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  recentCard: {
    width: 120,
    gap: Spacing.one,
  },
  recentArtwork: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 4,
  },
  recentTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  recentArtist: {
    color: '#A09080',
    fontSize: 12,
  },
  chartList: {
    gap: Spacing.two,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1F16',
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.three,
  },
  chartArtwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartNumber: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '700',
  },
  chartInfo: {
    flex: 1,
    gap: 2,
  },
  chartTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  chartArtist: {
    color: '#A09080',
    fontSize: 12,
  },
  chartPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
