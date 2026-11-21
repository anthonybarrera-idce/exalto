import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { useAudio } from '@/hooks/use-audio';
import { useHymns } from '@/context/hymns-context';
import { HYMNALS } from '@/data/hymnals';
import { Hymn } from '@/context/audio-context';
import { AccentColor, AppBackground, BottomTabInset, MiniPlayerHeight, Spacing } from '@/constants/theme';

export default function HymnsScreen() {
  const { loadHymn, isPlayerVisible } = useAudio();
  const [query, setQuery] = useState('');
  const [hymnalId, setHymnalId] = useState(HYMNALS[0].id);
  const { byHymnal, loading, error } = useHymns();
  const HYMNS = byHymnal(hymnalId);
  const q = query.trim().toLowerCase();

  const filtered = q
    ? HYMNS.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          (h.label ?? String(h.hymnNumber ?? '')).toLowerCase() === q,
      )
    : HYMNS;

  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight : 0) + Spacing.three;

  function playHymn(hymn: Hymn) {
    loadHymn(hymn, filtered, filtered.indexOf(hymn));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={styles.screenTitle}>Himnario</ThemedText>

        <View style={styles.hymnalChips}>
          {HYMNALS.filter((h) => h.id !== 'community').map((h) => (
            <Pressable
              key={h.id}
              onPress={() => setHymnalId(h.id)}
              style={[styles.chip, hymnalId === h.id && styles.chipActive]}>
              <ThemedText style={[styles.chipText, hymnalId === h.id && styles.chipTextActive]}>{h.shortName}</ThemedText>
            </Pressable>
          ))}
        </View>

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
          initialNumToRender={20}
          ListEmptyComponent={
            <ThemedText style={styles.hymnArtist}>
              {loading ? 'Loading hymns…' : error ? `Couldn't load hymns: ${error}` : 'No hymns match.'}
            </ThemedText>
          }
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <Pressable style={styles.hymnRow} onPress={() => playHymn(item)}>
              <View style={[styles.hymnArtwork, { backgroundColor: item.artworkColor }]}>
                {item.label != null && <ThemedText style={styles.hymnNum}>{item.label}</ThemedText>}
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
  hymnalChips: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#2A1F16',
  },
  chipActive: {
    backgroundColor: AccentColor,
  },
  chipText: {
    color: '#A09080',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#04131B',
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
