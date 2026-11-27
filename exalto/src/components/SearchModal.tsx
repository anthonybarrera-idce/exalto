import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Search, X } from 'lucide-react-native';
import { HymnArt } from '@/components/ui/hymn-art';
import { useLocale, useSectionLabel } from '@/context/locale-context';
import { useMemo, useRef, useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { useHymns } from '@/context/hymns-context';
import { Hymn, LyricSection } from '@/context/audio-context';
import { useAudio } from '@/hooks/use-audio';
import { Palette, Spacing } from '@/constants/theme';

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
  const { hymns: HYMNS } = useHymns();
  const { t } = useLocale();
  const sectionLabel = useSectionLabel();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInputInstance>(null);

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
        (hymn.label ?? String(hymn.hymnNumber ?? '')).toLowerCase() === q;

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

    // Title matches first, then lyric matches, so the section headers group correctly.
    return [...out.filter((r) => r.kind === 'hymn'), ...out.filter((r) => r.kind === 'lyric')].slice(0, 100);
  }, [q, HYMNS, sectionLabel]);

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
          <View style={styles.field}>
          <Search size={20} color={Palette.cyan} strokeWidth={2} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={t('search.placeholder')}
            placeholderTextColor="#3FA9CF"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={18} color={Palette.cyan} />
            </Pressable>
          )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.cancelBtn}>
            <ThemedText style={styles.cancelText}>{t('search.cancel')}</ThemedText>
          </Pressable>
        </View>

        {/* Results */}
        {q.length === 0 ? (
          <View style={styles.emptyState}>
            <Search size={40} color={Palette.line} />
            <ThemedText style={styles.emptyText}>{t('search.prompt')}</ThemedText>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>{t('search.noResults', { query })}</ThemedText>
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
                    <ThemedText style={styles.sectionHeader}>{t('search.hymns')}</ThemedText>
                  )}
                  {showLyricHeader && (
                    <ThemedText style={styles.sectionHeader}>{t('search.inLyrics')}</ThemedText>
                  )}
                  {item.kind === 'hymn' ? (
                    <Pressable style={styles.hymnRow} onPress={() => play(item.hymn)}>
                      <HymnArt seed={item.hymn.id} size={44} radius={8} label={item.hymn.label} />
                      <View style={styles.hymnInfo}>
                        <ThemedText style={styles.hymnTitle} numberOfLines={1}>
                          {item.hymn.title}
                        </ThemedText>
                        <ThemedText style={styles.hymnArtist} numberOfLines={1}>
                          {item.hymn.artist}
                        </ThemedText>
                      </View>
                      <Pressable onPress={() => play(item.hymn)} hitSlop={8}>
                        <BookOpen size={20} color={Palette.amber} strokeWidth={1.6} />
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
    backgroundColor: Palette.bg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#0B4E66',
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    color: '#BDEBFA',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  cancelBtn: {
    paddingLeft: Spacing.one,
  },
  cancelText: {
    color: Palette.cyan,
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
    color: Palette.muted,
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 40,
    paddingTop: Spacing.three,
  },
  sectionHeader: {
    color: Palette.muted,
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
    color: Palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  hymnArtist: {
    color: Palette.muted,
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
    color: Palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  lyricSection: {
    color: Palette.muted,
    fontSize: 11,
  },
  resultLine: {
    color: Palette.text,
    fontSize: 14,
  },
  highlight: {
    color: Palette.cyan,
    fontWeight: '700',
  },
});
