import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { useAudio } from '@/hooks/use-audio';
import { HYMNS } from '@/data/hymns';
import { Hymn } from '@/context/audio-context';
import { AccentColor, AppBackground, BottomTabInset, MiniPlayerHeight, Spacing } from '@/constants/theme';

export default function HymnsScreen() {
  const { loadHymn, isPlayerVisible } = useAudio();
  const [query, setQuery] = useState('');

  const filtered = query
    ? HYMNS.filter(
        (h) =>
          h.title.toLowerCase().includes(query.toLowerCase()) ||
          h.artist.toLowerCase().includes(query.toLowerCase()) ||
          String(h.hymnNumber).includes(query),
      )
    : HYMNS;

  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight : 0) + Spacing.three;

  function playHymn(hymn: Hymn) {
    loadHymn(hymn, filtered, filtered.indexOf(hymn));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={styles.screenTitle}>Hymns Book</ThemedText>

        {/* Search */}
        <View style={styles.searchContainer}>
          <SymbolView name="magnifyingglass" size={16} tintColor="#A09080" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search hymns..."
            placeholderTextColor="#55504A"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <SymbolView name="xmark.circle.fill" size={16} tintColor="#55504A" />
            </Pressable>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <Pressable style={styles.hymnRow} onPress={() => playHymn(item)}>
              <View style={[styles.hymnArtwork, { backgroundColor: item.artworkColor }]}>
                {item.hymnNumber && (
                  <ThemedText style={styles.hymnNum}>{item.hymnNumber}</ThemedText>
                )}
              </View>
              <View style={styles.hymnInfo}>
                <ThemedText style={styles.hymnTitle} numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText style={styles.hymnArtist} numberOfLines={1}>
                  {item.artist}
                </ThemedText>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor="#55504A" />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1F16',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    padding: 0,
  },
  hymnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  hymnArtwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hymnNum: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '700',
  },
  hymnInfo: {
    flex: 1,
    gap: 3,
  },
  hymnTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  hymnArtist: {
    color: '#A09080',
    fontSize: 13,
  },
  separator: {
    height: 1,
    backgroundColor: '#2A1F16',
  },
});
