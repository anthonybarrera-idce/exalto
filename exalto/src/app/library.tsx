import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { useAudio } from '@/hooks/use-audio';
import { HYMNS } from '@/data/hymns';
import { Hymn } from '@/context/audio-context';
import { AccentColor, AppBackground, BottomTabInset, MiniPlayerHeight, Spacing } from '@/constants/theme';

const SAVED = HYMNS.slice(0, 5);
const DOWNLOADED = HYMNS.slice(2, 7);

export default function LibraryScreen() {
  const { loadHymn, isPlayerVisible } = useAudio();
  const [tab, setTab] = useState<'saved' | 'downloaded'>('saved');

  const hymns = tab === 'saved' ? SAVED : DOWNLOADED;
  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight : 0) + Spacing.three;

  function playHymn(hymn: Hymn) {
    loadHymn(hymn, hymns, hymns.indexOf(hymn));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={styles.screenTitle}>Library</ThemedText>

        {/* Segmented control */}
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, tab === 'saved' && styles.segmentActive]}
            onPress={() => setTab('saved')}>
            <ThemedText style={[styles.segmentText, tab === 'saved' && styles.segmentTextActive]}>
              Saved
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.segment, tab === 'downloaded' && styles.segmentActive]}
            onPress={() => setTab('downloaded')}>
            <ThemedText style={[styles.segmentText, tab === 'downloaded' && styles.segmentTextActive]}>
              Downloaded
            </ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={hymns}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => (
            <Pressable style={styles.gridCard} onPress={() => playHymn(item)}>
              <View style={[styles.gridArtwork, { backgroundColor: item.artworkColor }]}>
                <Pressable
                  onPress={() => playHymn(item)}
                  style={styles.gridPlayButton}>
                  <SymbolView name="play.fill" size={16} tintColor="#FFFFFF" />
                </Pressable>
              </View>
              <ThemedText style={styles.gridTitle} numberOfLines={2}>
                {item.title}
              </ThemedText>
              <ThemedText style={styles.gridArtist} numberOfLines={1}>
                {item.artist}
              </ThemedText>
            </Pressable>
          )}
        />
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
    paddingHorizontal: Spacing.four,
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#2A1F16',
    borderRadius: 10,
    padding: 3,
    marginBottom: Spacing.four,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#3A2C20',
  },
  segmentText: {
    color: '#55504A',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  columnWrapper: {
    gap: Spacing.three,
  },
  gridCard: {
    flex: 1,
    marginBottom: Spacing.three,
    gap: Spacing.one,
  },
  gridArtwork: {
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: Spacing.two,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: Spacing.two,
  },
  gridPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  gridArtist: {
    color: '#A09080',
    fontSize: 12,
  },
});
