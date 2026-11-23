import { BookOpen, Pause, Play, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModeSwitcher } from '@/components/ModeSwitcher';
import { ThemedText } from '@/components/themed-text';
import { AppHeader } from '@/components/ui/app-header';
import { GradientBorder } from '@/components/ui/gradient-border';
import { BottomTabInset, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useHymns } from '@/context/hymns-context';
import { useViewMode } from '@/context/view-mode-context';
import { HYMNALS } from '@/data/hymnals';
import { useAudio } from '@/hooks/use-audio';
import { useLocale } from '@/context/locale-context';

const BOOKS = HYMNALS.filter((h) => h.id !== 'community');

export default function HymnsScreen() {
  const { loadHymn, expandPlayer, currentHymn, isPlaying, isPlayerVisible } = useAudio();
  const { viewMode, setViewMode } = useViewMode();
  const { byHymnal, loading, error } = useHymns();
  const [hymnalId, setHymnalId] = useState(BOOKS[0].id);
  const [query, setQuery] = useState('');
  const { t } = useLocale();

  const all = byHymnal(hymnalId);
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () => (q ? all.filter((h) => h.title.toLowerCase().includes(q) || (h.label ?? '').toLowerCase() === q) : all),
    [all, q],
  );

  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.three;

  function read(hymn: Hymn) {
    setViewMode('hymnal');
    loadHymn(hymn, list, list.indexOf(hymn));
    expandPlayer();
  }

  function listen(hymn: Hymn) {
    if (!hymn.audioUri) return read(hymn);
    setViewMode('audio');
    loadHymn(hymn, list, list.indexOf(hymn));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <AppHeader title={t('hymns.title')} />

        <View style={styles.books}>
          {BOOKS.map((b) => {
            const on = b.id === hymnalId;
            return (
              <Pressable key={b.id} onPress={() => setHymnalId(b.id)} style={[styles.book, on && styles.bookOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <ThemedText style={[styles.bookText, on && styles.bookTextOn]}>{b.shortName}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        <GradientBorder radius={20} fill={[Palette.sheetTop, '#2A2016']} colors={['#3A2C20', '#3A2C20']} style={[styles.sheet, { marginBottom: bottomPad }]}>
          <View style={styles.search}>
            <Search size={20} color={Palette.cyan} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('hymns.search')}
              placeholderTextColor="#3FA9CF"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              accessibilityLabel={t('hymns.searchLabel')}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('hymns.clearSearch')}>
                <X size={16} color={Palette.cyan} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={list}
            keyExtractor={(h) => h.id}
            initialNumToRender={20}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <ThemedText style={styles.empty}>
                {loading ? t('hymns.loading') : error ? t('hymns.loadError', { error }) : q ? t('hymns.noMatch') : t('hymns.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => {
              const active = currentHymn?.id === item.id;
              const color = active ? Palette.cyan : Palette.text;
              return (
                <Pressable style={styles.row} onPress={() => (viewMode === 'hymnal' ? read(item) : listen(item))} accessibilityRole="button" accessibilityLabel={`Hymn ${item.label ?? ''} ${item.title}`}>
                  <ThemedText style={[styles.num, { color }]}>{item.label ?? '–'}</ThemedText>
                  <ThemedText style={[styles.title, { color }]} numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  <Pressable onPress={() => read(item)} hitSlop={8} style={styles.icon} accessibilityLabel={t('hymns.read', { title: item.title })}>
                    <BookOpen size={22} strokeWidth={1.6} color={active ? Palette.cyan : Palette.amber} />
                  </Pressable>
                  <Pressable onPress={() => listen(item)} hitSlop={8} style={styles.icon} accessibilityLabel={t(item.audioUri ? 'hymns.play' : 'hymns.noRecording', { title: item.title })}>
                    {active && isPlaying ? (
                      <Pause size={22} strokeWidth={1.8} color={Palette.cyan} />
                    ) : (
                      <Play size={22} strokeWidth={1.6} color={item.audioUri ? color : Palette.muted} />
                    )}
                  </Pressable>
                </Pressable>
              );
            }}
          />
          <ModeSwitcher bottom={Spacing.three} />
        </GradientBorder>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  books: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  book: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: Palette.pill },
  bookOn: { backgroundColor: Palette.cyan },
  bookText: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  bookTextOn: { color: '#04131B' },
  sheet: { flex: 1, marginHorizontal: Spacing.three },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.three,
    marginBottom: Spacing.two,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#0B4E66',
    paddingHorizontal: Spacing.three,
  },
  searchInput: { flex: 1, color: '#BDEBFA', fontSize: 15, padding: 0, fontFamily: 'PlusJakartaSans_500Medium' },
  listContent: { paddingHorizontal: Spacing.four, paddingBottom: 72 },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, gap: Spacing.three },
  num: { minWidth: 30, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  title: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  icon: { padding: 4 },
  sep: { height: 1, backgroundColor: '#33271B' },
  empty: { color: Palette.muted, fontSize: 14, lineHeight: 20, paddingVertical: Spacing.four, textAlign: 'center' },
});
