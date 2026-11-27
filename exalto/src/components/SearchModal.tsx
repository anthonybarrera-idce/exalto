import { BookOpen, Check, ChevronRight, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ComposerAvatar } from '@/components/ui/composer-avatar';
import { HymnArt } from '@/components/ui/hymn-art';
import { FontFamily, Palette, Spacing } from '@/constants/theme';
import { hasRecording, type Hymn } from '@/context/audio-context';
import { useAuth } from '@/context/auth-context';
import { useHymns } from '@/context/hymns-context';
import { useLocale, useSectionLabel } from '@/context/locale-context';
import { useHymnals, type Hymnal } from '@/data/hymnals';
import { useAudio } from '@/hooks/use-audio';
import { useComposers, type Composer } from '@/hooks/use-composers';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
}

type Kind = 'hymnal' | 'composer' | 'hymn' | 'lyric';
type Result =
  | { kind: 'hymnal'; hymnal: Hymnal; count: number }
  | { kind: 'composer'; composer: Composer }
  | { kind: 'hymn'; hymn: Hymn }
  | { kind: 'lyric'; hymn: Hymn; line: string; sectionLabel: string };

/** What the type chips show. "all" lists every kind, in the order below. */
type TypeFilter = 'all' | Kind;
const TYPES: TypeFilter[] = ['all', 'hymn', 'lyric', 'composer', 'hymnal'];
const ORDER: Kind[] = ['hymnal', 'composer', 'hymn', 'lyric'];

/** Under "All", composers and hymnals are a short preview; their own chip lists them all. */
const PREVIEW = 5;
const MAX_RESULTS = 200;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function highlight(text: string, query: string) {
  // Accent-insensitive: "jehova" finds "Jehová". Folding keeps one char per char for Spanish text, so indexes line up.
  const idx = fold(text).indexOf(fold(query));
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
  const [type, setType] = useState<TypeFilter>('all');
  const [scope, setScope] = useState<string | null>(null);
  const [withRecording, setWithRecording] = useState(false);
  const [withPractice, setWithPractice] = useState(false);
  const { loadHymn } = useAudio();
  const { hymns: HYMNS } = useHymns();
  const hymnals = useHymnals();
  const composers = useComposers(HYMNS, hymnals);
  const { openComposer } = useAuth();
  const { t, plural } = useLocale();
  const sectionLabel = useSectionLabel();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setType('all');
      setScope(null);
      setWithRecording(false);
      setWithPractice(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible]);

  const q = fold(query.trim());
  const scoped = hymnals.find((h) => h.id === scope);
  const hymnFilters = withRecording || withPractice || !!scoped;
  // The recording / practice toggles only apply to hymns and lyrics.
  const showToggles = type === 'all' || type === 'hymn' || type === 'lyric';

  const shelf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of HYMNS) if (h.hymnalId) counts.set(h.hymnalId, (counts.get(h.hymnalId) ?? 0) + 1);
    return hymnals.filter((h) => h.visible && counts.has(h.id)).map((hymnal) => ({ hymnal, count: counts.get(hymnal.id)! }));
  }, [HYMNS, hymnals]);

  const results = useMemo<Result[]>(() => {
    const wants = (k: Kind) => type === 'all' || type === k;
    // With no text, filters alone browse: a hymnal, "with recording", etc. list their hymns.
    if (!q && !(hymnFilters && (wants('hymn') || type === 'lyric'))) return [];
    const out: Result[] = [];

    if (q && !scoped && wants('hymnal')) {
      const found = shelf.filter(({ hymnal }) => fold(hymnal.name).includes(q) || fold(hymnal.shortName).includes(q));
      for (const s of type === 'all' ? found.slice(0, PREVIEW) : found) out.push({ kind: 'hymnal', ...s });
    }

    if (q && !scoped && wants('composer')) {
      const found = composers.filter((c) => fold(c.name).includes(q) || (c.handle && fold(c.handle).includes(q.replace(/^@/, ''))));
      for (const composer of type === 'all' ? found.slice(0, PREVIEW) : found) out.push({ kind: 'composer', composer });
    }

    const pool = HYMNS.filter(
      (h) => (!scoped || h.hymnalId === scoped.id) && (!withRecording || hasRecording(h)) && (!withPractice || h.practice),
    );

    if (wants('hymn') || (!q && type === 'lyric')) {
      for (const hymn of pool) {
        if (!q || fold(hymn.title).includes(q) || fold(hymn.artist).includes(q) || (hymn.label ?? String(hymn.hymnNumber ?? '')).toLowerCase() === q) {
          out.push({ kind: 'hymn', hymn });
        }
      }
    }

    if (q && wants('lyric')) {
      for (const hymn of pool) {
        for (const section of hymn.lyrics ?? []) {
          for (const line of section.lines) {
            if (fold(line).includes(q)) out.push({ kind: 'lyric', hymn, line, sectionLabel: sectionLabel(section) });
          }
        }
      }
    }

    // Grouped by kind so the section headers line up.
    return ORDER.flatMap((k) => out.filter((r) => r.kind === k)).slice(0, MAX_RESULTS);
  }, [q, type, scoped, withRecording, withPractice, hymnFilters, shelf, composers, HYMNS, sectionLabel]);

  function play(hymn: Hymn) {
    // Opens it like the rest of the app (follows Auto-play); the queue is the hymns found.
    const queue = results.flatMap((r) => (r.kind === 'hymn' ? [r.hymn] : []));
    const list = queue.includes(hymn) ? queue : HYMNS;
    loadHymn(hymn, list, list.indexOf(hymn));
    onClose();
  }

  function pickHymnal(id: string) {
    setScope(id);
    setQuery('');
    if (type === 'hymnal' || type === 'composer') setType('all');
  }

  function showComposer(uid: string) {
    onClose();
    openComposer(uid);
  }

  const header = (kind: Kind) =>
    ({ hymnal: t('search.hymnals'), composer: t('search.composers'), hymn: t('search.hymns'), lyric: t('search.inLyrics') })[kind];
  const typeLabel = (k: TypeFilter) =>
    k === 'all' ? t('search.all') : k === 'hymn' ? t('search.hymns') : k === 'lyric' ? t('search.lyrics') : k === 'composer' ? t('search.composers') : t('search.hymnals');

  // A page sheet on iOS already starts below the status bar; elsewhere the modal covers it.
  const topPad = Platform.OS === 'ios' ? Spacing.three : insets.top + Spacing.three;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Search bar */}
        <View style={[styles.searchBar, { paddingTop: topPad }]}>
          <View style={styles.field}>
            <Search size={20} color={Palette.cyan} strokeWidth={2} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={scoped ? t('search.inHymnal', { name: scoped.shortName || scoped.name }) : t('search.placeholder')}
              placeholderTextColor="#3FA9CF"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('search.clear')}>
                <X size={18} color={Palette.cyan} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.cancelBtn} accessibilityRole="button">
            <ThemedText style={styles.cancelText}>{t('search.cancel')}</ThemedText>
          </Pressable>
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.filterBar} contentContainerStyle={styles.filters}>
          {scoped && (
            <Pressable
              onPress={() => setScope(null)}
              style={[styles.chip, styles.chipScope]}
              accessibilityRole="button"
              accessibilityLabel={t('search.clearHymnal', { name: scoped.name })}>
              <View style={[styles.dot, { backgroundColor: scoped.color }]} />
              <ThemedText style={[styles.chipText, styles.chipTextActive]} numberOfLines={1}>
                {scoped.shortName || scoped.name}
              </ThemedText>
              <X size={14} color="#04131B" />
            </Pressable>
          )}
          {TYPES.filter((k) => !scoped || k === 'all' || k === 'hymn' || k === 'lyric').map((k) => (
            <Chip key={k} label={typeLabel(k)} active={type === k} onPress={() => setType(k)} />
          ))}
          {showToggles && (
            <>
              <View style={styles.divider} />
              <Chip label={t('search.withRecording')} active={withRecording} toggle onPress={() => setWithRecording((v) => !v)} />
              <Chip label={t('search.withPractice')} active={withPractice} toggle onPress={() => setWithPractice((v) => !v)} />
            </>
          )}
        </ScrollView>

        {/* Results */}
        {results.length === 0 ? (
          <View style={styles.emptyState}>
            {q.length === 0 && hymnFilters ? (
              <ThemedText style={styles.emptyText}>{t('search.noFilterResults')}</ThemedText>
            ) : q.length === 0 ? (
              <>
                <Search size={40} color={Palette.line} />
                <ThemedText style={styles.emptyText}>{t('search.prompt')}</ThemedText>
              </>
            ) : (
              <ThemedText style={styles.emptyText}>{t('search.noResults', { query: query.trim() })}</ThemedText>
            )}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r, i) => `${r.kind}:${r.kind === 'hymnal' ? r.hymnal.id : r.kind === 'composer' ? r.composer.uid : r.hymn.id}:${i}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={15}
            renderItem={({ item, index }) => (
              <>
                {(index === 0 || results[index - 1].kind !== item.kind) && <ThemedText style={styles.sectionHeader}>{header(item.kind)}</ThemedText>}
                {item.kind === 'hymnal' ? (
                  <Pressable style={styles.hymnRow} onPress={() => pickHymnal(item.hymnal.id)} accessibilityRole="button" accessibilityLabel={item.hymnal.name}>
                    <HymnArt seed={item.hymnal.id} hymnalId={item.hymnal.id} size={44} radius={8} />
                    <View style={styles.hymnInfo}>
                      <ThemedText style={styles.hymnTitle} numberOfLines={1}>
                        {item.hymnal.name}
                      </ThemedText>
                      <ThemedText style={styles.hymnArtist} numberOfLines={1}>
                        {plural('library.count', item.count)}
                      </ThemedText>
                    </View>
                    <ChevronRight size={20} color={Palette.amber} strokeWidth={1.6} />
                  </Pressable>
                ) : item.kind === 'composer' ? (
                  <Pressable
                    style={styles.hymnRow}
                    onPress={() => showComposer(item.composer.uid)}
                    accessibilityRole="button"
                    accessibilityLabel={item.composer.name}>
                    <ComposerAvatar name={item.composer.name} photoURL={item.composer.photoURL} size={44} />
                    <View style={styles.hymnInfo}>
                      <ThemedText style={styles.hymnTitle} numberOfLines={1}>
                        {item.composer.name}
                      </ThemedText>
                      <ThemedText style={styles.hymnArtist} numberOfLines={1}>
                        {item.composer.handle ? `@${item.composer.handle} · ` : ''}
                        {plural('library.count', item.composer.count)}
                      </ThemedText>
                    </View>
                    <ChevronRight size={20} color={Palette.amber} strokeWidth={1.6} />
                  </Pressable>
                ) : item.kind === 'hymn' ? (
                  // One button for the whole row; the book icon is just a visual cue.
                  <Pressable style={styles.hymnRow} onPress={() => play(item.hymn)} accessibilityRole="button" accessibilityLabel={item.hymn.title}>
                    <HymnArt seed={item.hymn.id} hymnalId={item.hymn.hymnalId} size={44} radius={8} label={item.hymn.label} />
                    <View style={styles.hymnInfo}>
                      <ThemedText style={styles.hymnTitle} numberOfLines={1}>
                        {item.hymn.title}
                      </ThemedText>
                      <ThemedText style={styles.hymnArtist} numberOfLines={1}>
                        {item.hymn.artist}
                      </ThemedText>
                    </View>
                    <BookOpen size={20} color={Palette.amber} strokeWidth={1.6} />
                  </Pressable>
                ) : (
                  <Pressable style={styles.lyricRow} onPress={() => play(item.hymn)} accessibilityRole="button" accessibilityLabel={`${item.hymn.title}: ${item.line}`}>
                    <View style={styles.lyricMeta}>
                      <ThemedText style={styles.lyricHymnName} numberOfLines={1}>
                        {item.hymn.title}
                      </ThemedText>
                      <ThemedText style={styles.lyricSection}>{item.sectionLabel}</ThemedText>
                    </View>
                    {highlight(item.line, query.trim())}
                  </Pressable>
                )}
              </>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({ label, active, onPress, toggle }: { label: string; active: boolean; onPress: () => void; toggle?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole={toggle ? 'checkbox' : 'button'}
      accessibilityState={toggle ? { checked: active } : { selected: active }}
      accessibilityLabel={label}>
      {toggle && active ? <Check size={14} color="#04131B" strokeWidth={2.5} /> : null}
      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
    </Pressable>
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
    fontFamily: FontFamily.medium,
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
  // Keeps its own height; otherwise the results list squeezes the chips.
  filterBar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filters: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Palette.pill,
  },
  chipActive: {
    backgroundColor: Palette.cyan,
  },
  chipScope: {
    backgroundColor: Palette.amber,
    maxWidth: 200,
  },
  chipText: {
    color: Palette.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#04131B',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: Palette.line,
    marginHorizontal: Spacing.one,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingBottom: 80,
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    color: Palette.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 40,
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
