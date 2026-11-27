import { BookOpen, Check, ChevronDown, Pause, Play, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModeSwitcher } from '@/components/ModeSwitcher';
import { ThemedText } from '@/components/themed-text';
import { AppHeader } from '@/components/ui/app-header';
import { GradientBorder } from '@/components/ui/gradient-border';
import { BottomTabInset, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useHymns } from '@/context/hymns-context';
import { useViewMode } from '@/context/view-mode-context';
import { useHymnals, type Hymnal } from '@/data/hymnals';
import { useAudio } from '@/hooks/use-audio';
import { useLocale } from '@/context/locale-context';

export default function HymnsScreen() {
  const { loadHymn, expandPlayer, currentHymn, isPlaying, isPlayerVisible } = useAudio();
  const { viewMode, setViewMode } = useViewMode();
  const { byHymnal, loading, error } = useHymns();
  // Visible hymnals in the order set in the admin / Hymn Studio: official first, then community (incl. composers').
  const hymnals = useHymnals();
  const BOOKS = useMemo(() => {
    const shown = hymnals.filter((h) => h.visible);
    return [...shown.filter((h) => h.kind === 'official'), ...shown.filter((h) => h.kind === 'community')];
  }, [hymnals]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picked, setHymnalId] = useState<string | null>(null);
  const hymnalId = BOOKS.find((b) => b.id === picked)?.id ?? BOOKS[0]?.id ?? '';
  const current = BOOKS.find((b) => b.id === hymnalId);
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
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={styles.select}
            accessibilityRole="button"
            accessibilityLabel={`${t('hymns.pickHymnal')}: ${current?.name ?? ''}`}
          >
            <View style={[styles.dot, { backgroundColor: current?.color ?? Palette.pill }]} />
            <ThemedText style={styles.selectText} numberOfLines={1}>{current?.name ?? ''}</ThemedText>
            <ChevronDown size={18} color={Palette.text} />
          </Pressable>
        </View>
        <HymnalMenu
          open={menuOpen}
          hymnals={BOOKS}
          selected={hymnalId}
          onPick={(id) => {
            setHymnalId(id);
            setQuery('');
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />

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

/** The hymnal dropdown: a sheet listing official hymnals, then community ones. */
function HymnalMenu({ open, hymnals, selected, onPick, onClose }: { open: boolean; hymnals: Hymnal[]; selected: string; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useLocale();
  const groups = [
    { title: t('hymns.official'), items: hymnals.filter((h) => h.kind === 'official') },
    { title: t('hymns.community'), items: hymnals.filter((h) => h.kind === 'community') },
  ].filter((g) => g.items.length);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('hymns.pickHymnal')}>
        <Pressable style={styles.menu} onPress={() => {}}>
          <ScrollView>
            {groups.map((g) => (
              <View key={g.title}>
                <ThemedText style={styles.menuGroup}>{g.title}</ThemedText>
                {g.items.map((h) => {
                  const on = h.id === selected;
                  return (
                    <Pressable key={h.id} onPress={() => onPick(h.id)} style={[styles.menuItem, on && styles.menuItemOn]} accessibilityRole="menuitem" accessibilityState={{ selected: on }}>
                      <View style={[styles.dot, { backgroundColor: h.color }]} />
                      <View style={styles.menuLabel}>
                        <ThemedText style={[styles.menuText, on && { color: Palette.cyan }]} numberOfLines={1}>{h.name}</ThemedText>
                        {h.createdByName ? <ThemedText style={styles.menuBy} numberOfLines={1}>{h.createdByName}</ThemedText> : null}
                      </View>
                      {on && <Check size={18} color={Palette.cyan} />}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  books: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  select: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, alignSelf: 'flex-start', maxWidth: '100%', height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Palette.pill },
  selectText: { flexShrink: 1, color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Spacing.four },
  menu: { maxHeight: '70%', width: '100%', maxWidth: 420, alignSelf: 'center', borderRadius: 20, backgroundColor: Palette.sheetTop, paddingVertical: Spacing.two, borderWidth: 1, borderColor: '#3A2C20' },
  menuGroup: { color: Palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48, paddingHorizontal: Spacing.four },
  menuItemOn: { backgroundColor: '#2E2318' },
  menuLabel: { flex: 1, paddingVertical: Spacing.two },
  menuText: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  menuBy: { color: Palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '500' },
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
