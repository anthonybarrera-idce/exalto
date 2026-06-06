import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { HYMNS } from '@/data/hymns';
import { Hymn, LyricSection } from '@/context/audio-context';
import { useAudio } from '@/hooks/use-audio';
import { AccentColor, Spacing } from '@/constants/theme';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
}

interface HymnResult {
  kind: 'hymn';
  hymn: Hymn;
}

interface LyricResult {
  kind: 'lyric';
  hymn: Hymn;
  line: string;
  sectionLabel: string;
}

type Result = HymnResult | LyricResult;

function sectionLabel(s: LyricSection) {
  if (s.type === 'chorus') return 'Chorus';
  if (s.type === 'bridge') return 'Bridge';
  return `Verse ${s.number ?? ''}`;
}

function highlight(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <ThemedText style={styles.resultLine}>{text}</ThemedText>;
  return (
    <ThemedText style={styles.resultLine}>
      {text.slice(0, idx)}
      <ThemedText style={styles.highlight}>{text.slice(idx, idx + query.length)}</ThemedText>
      {text.slice(idx + query.length)}
    </ThemedText>
  );
}

export function SearchModal({ visible, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const { loadHymn } = useAudio();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible]);

  const q = query.trim().toLowerCase();

  const results = useMemo<Result[]>(() => {
    if (!q) return [];
    const out: Result[] = [];

    for (const hymn of HYMNS) {
      const titleMatch =
        hymn.title.toLowerCase().includes(q) ||
        hymn.artist.toLowerCase().includes(q) ||
        String(hymn.hymnNumber ?? '').includes(q);

      if (titleMatch) out.push({ kind: 'hymn', hymn });

      if (hymn.lyrics) {
        for (const section of hymn.lyrics) {
          for (const line of section.lines) {
            if (line.toLowerCase().includes(q)) {
              out.push({ kind: 'lyric', hymn, line, sectionLabel: sectionLabel(section) });
            }
          }
        }
      }
    }

    return out;
  }, [q]);

  function play(hymn: Hymn) {
    loadHymn(hymn, HYMNS, HYMNS.indexOf(hymn));
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Search bar */}
        <View style={[styles.searchBar, { paddingTop: insets.top + Spacing.two }]}>
          <SymbolView name="magnifyingglass" size={18} tintColor="#A09080" />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search hymns and lyrics…"
            placeholderTextColor="#5A4A3A"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <SymbolView name="xmark.circle.fill" size={18} tintColor="#5A4A3A" />
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={8} style={styles.cancelBtn}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </View>

        {/* Results */}
        {q.length === 0 ? (
          <View style={styles.emptyState}>
            <SymbolView name="magnifyingglass" size={40} tintColor="#3A2A1A" />
            <ThemedText style={styles.emptyText}>Search hymns and lyrics</ThemedText>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No results for "{query}"</ThemedText>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const prevItem = results[index - 1];
              const showHymnHeader =
                item.kind === 'hymn' &&
                (index === 0 || prevItem.kind !== 'hymn');
              const showLyricHeader =
                item.kind === 'lyric' &&
                (index === 0 || prevItem.kind === 'hymn');

              return (
                <>
                  {showHymnHeader && (
                    <ThemedText style={styles.sectionHeader}>Hymns</ThemedText>
                  )}
                  {showLyricHeader && (
                    <ThemedText style={styles.sectionHeader}>In Lyrics</ThemedText>
                  )}
                  {item.kind === 'hymn' ? (
                    <Pressable style={styles.hymnRow} onPress={() => play(item.hymn)}>
                      <View
                        style={[
                          styles.artwork,
                          { backgroundColor: item.hymn.artworkColor ?? AccentColor },
                        ]}
                      />
                      <View style={styles.hymnInfo}>
                        <ThemedText style={styles.hymnTitle} numberOfLines={1}>
                          {item.hymn.hymnNumber
                            ? `${item.hymn.hymnNumber} ${item.hymn.title}`
                            : item.hymn.title}
                        </ThemedText>
                        <ThemedText style={styles.hymnArtist} numberOfLines={1}>
                          {item.hymn.artist}
                        </ThemedText>
                      </View>
                      <Pressable onPress={() => play(item.hymn)} hitSlop={8}>
                        <SymbolView name="play.fill" size={16} tintColor="#A09080" />
                      </Pressable>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.lyricRow} onPress={() => play(item.hymn)}>
                      <View style={styles.lyricMeta}>
                        <ThemedText style={styles.lyricHymnName} numberOfLines={1}>
                          {item.hymn.title}
                        </ThemedText>
                        <ThemedText style={styles.lyricSection}>
                          {item.sectionLabel}
                        </ThemedText>
                      </View>
                      {highlight(item.line, query.trim())}
                    </Pressable>
                  )}
                </>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#100c08',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  cancelBtn: {
    paddingLeft: Spacing.one,
  },
  cancelText: {
    color: AccentColor,
    fontSize: 15,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingBottom: 80,
  },
  emptyText: {
    color: '#5A4A3A',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 40,
    paddingTop: Spacing.three,
  },
  sectionHeader: {
    color: '#A09080',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  hymnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  hymnInfo: {
    flex: 1,
    gap: 2,
  },
  hymnTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  hymnArtist: {
    color: '#A09080',
    fontSize: 12,
  },
  lyricRow: {
    paddingVertical: Spacing.two,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  lyricMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lyricHymnName: {
    color: '#A09080',
    fontSize: 12,
    fontWeight: '600',
  },
  lyricSection: {
    color: '#5A4A3A',
    fontSize: 11,
  },
  resultLine: {
    color: '#D0C0A8',
    fontSize: 14,
  },
  highlight: {
    color: AccentColor,
    fontWeight: '700',
  },
});
