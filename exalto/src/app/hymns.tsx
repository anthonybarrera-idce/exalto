import { BookOpen, Check, ChevronDown, MoreVertical, Pause, Pencil, Play, Plus, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchModal } from '@/components/SearchModal';
import { ThemedText } from '@/components/themed-text';
import { AppHeader } from '@/components/ui/app-header';
import { GradientBorder } from '@/components/ui/gradient-border';
import { useMenuEntering, withTabTransition } from '@/components/ui/transitions';
import { BottomTabInset, FontFamily, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import { hasRecording, type Hymn } from '@/context/audio-context';
import { useAuth } from '@/context/auth-context';
import { useHymns } from '@/context/hymns-context';
import { useHymnals, type Hymnal } from '@/data/hymnals';
import { useAudio } from '@/hooks/use-audio';
import { useCanEdit } from '@/hooks/use-can-edit';
import { useLocale } from '@/context/locale-context';
import { usePlaylists } from '@/context/playlists-context';

export default withTabTransition(HymnsScreen, 1);

function HymnsScreen() {
  const { loadHymn, expandPlayer, currentHymn, isPlaying, isPlayerVisible } = useAudio();
  const { openMenu } = usePlaylists();
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
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useLocale();
  const { openComposer, openEditor } = useAuth();
  const can = useCanEdit();
  const editable = can.hymnal(current);

  const all = byHymnal(hymnalId);
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () => (q ? all.filter((h) => h.title.toLowerCase().includes(q) || (h.label ?? '').toLowerCase() === q) : all),
    [all, q],
  );

  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.three;

  function read(hymn: Hymn) {
    loadHymn(hymn, list, list.indexOf(hymn), { play: false });
    expandPlayer();
  }

  function listen(hymn: Hymn) {
    loadHymn(hymn, list, list.indexOf(hymn), { play: true });
  }

  // Tapping a row follows the "Auto-play recordings" setting; hymns without a recording open their lyrics.
  function open(hymn: Hymn) {
    loadHymn(hymn, list, list.indexOf(hymn));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <AppHeader title={t('hymns.title')} onSearch={() => setSearchOpen(true)} />

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
          {/* A composer's hymnal links to their composer profile. */}
          {current?.ownerUid && current.createdByName ? (
            <Pressable onPress={() => openComposer(current.ownerUid!)} hitSlop={8} style={styles.byline} accessibilityRole="link">
              <ThemedText style={styles.bylineText} numberOfLines={1}>{t('composer.by', { name: current.createdByName })}</ThemedText>
            </Pressable>
          ) : null}
          {/* Staff, and composers on their own hymnals, can edit the hymnal and add hymns from here. */}
          {editable && current ? (
            <View style={styles.editTools}>
              <Pressable onPress={() => openEditor({ kind: 'hymnal', id: current.id })} hitSlop={8} style={styles.toolBtn} accessibilityRole="button" accessibilityLabel={t('hymns.editHymnal')}>
                <Pencil size={18} color={Palette.text} />
              </Pressable>
              <Pressable onPress={() => openEditor({ kind: 'hymn', hymnalId: current.id })} hitSlop={8} style={styles.toolBtn} accessibilityRole="button" accessibilityLabel={t('edit.newHymn')}>
                <Plus size={20} color={Palette.cyan} />
              </Pressable>
            </View>
          ) : null}
        </View>
        <HymnalMenu
          open={menuOpen}
          hymnals={BOOKS}
          selected={hymnalId}
          onNew={
            can.canCreate
              ? () => {
                  setMenuOpen(false);
                  openEditor({ kind: 'hymnal' });
                }
              : undefined
          }
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
                // The row's main tap and the read/play icons are siblings, not nested buttons.
                <View style={styles.row}>
                  <Pressable
                    style={styles.rowOpen}
                    onPress={() => open(item)}
                    // Editors: long-press a hymn to edit it. Everyone else gets the hymn menu.
                    onLongPress={can.hymn(item, current) ? () => openEditor({ kind: 'hymn', id: item.id }) : () => openMenu(item)}
                    accessibilityActions={can.hymn(item, current) ? [{ name: 'edit', label: t('hymns.edit', { title: item.title }) }] : undefined}
                    onAccessibilityAction={(e) => e.nativeEvent.actionName === 'edit' && openEditor({ kind: 'hymn', id: item.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Hymn ${item.label ?? ''} ${item.title}`}>
                    <ThemedText style={[styles.num, { color }]}>{item.label ?? '–'}</ThemedText>
                    <ThemedText style={[styles.title, { color }]} numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => read(item)} hitSlop={8} style={styles.icon} accessibilityRole="button" accessibilityLabel={t('hymns.read', { title: item.title })}>
                    <BookOpen size={22} strokeWidth={1.6} color={active ? Palette.cyan : Palette.amber} />
                  </Pressable>
                  {hasRecording(item) ? (
                    <Pressable onPress={() => listen(item)} hitSlop={8} style={styles.icon} accessibilityRole="button" accessibilityLabel={t('hymns.play', { title: item.title })}>
                      {active && isPlaying ? (
                        <Pause size={22} strokeWidth={1.8} color={Palette.cyan} />
                      ) : (
                        <Play size={22} strokeWidth={1.6} color={color} />
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => openMenu(item)} hitSlop={8} style={styles.icon} accessibilityRole="button" accessibilityLabel={t('hymns.more', { title: item.title })}>
                    <MoreVertical size={20} strokeWidth={1.8} color={Palette.muted} />
                  </Pressable>
                </View>
              );
            }}
          />
        </GradientBorder>
      </SafeAreaView>
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

/** The hymnal dropdown: a sheet listing official hymnals, then community ones. */
function HymnalMenu({ open, hymnals, selected, onPick, onClose, onNew }: { open: boolean; hymnals: Hymnal[]; selected: string; onPick: (id: string) => void; onClose: () => void; onNew?: () => void }) {
  const { t } = useLocale();
  const menuEntering = useMenuEntering();
  const groups = [
    { title: t('hymns.official'), items: hymnals.filter((h) => h.kind === 'official') },
    { title: t('hymns.community'), items: hymnals.filter((h) => h.kind === 'community') },
  ].filter((g) => g.items.length);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* The backdrop's close target sits behind the menu as a sibling, so menu items aren't nested in it. */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('player.close')} />
        <Animated.View entering={menuEntering} style={styles.menu} accessibilityLabel={t('hymns.pickHymnal')}>
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
            {onNew && (
              <Pressable onPress={onNew} style={styles.menuItem} accessibilityRole="menuitem">
                <Plus size={16} color={Palette.cyan} />
                <ThemedText style={[styles.menuText, { color: Palette.cyan }]}>{t('hymnalEdit.new')}</ThemedText>
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  books: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, marginBottom: Spacing.three },
  byline: { flexShrink: 1 },
  editTools: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  toolBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.pill },
  bylineText: { color: Palette.cyan, fontSize: 14, lineHeight: 20, fontWeight: '700' },
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
  searchInput: { flex: 1, color: '#BDEBFA', fontSize: 15, padding: 0, fontFamily: FontFamily.medium },
  listContent: { paddingHorizontal: Spacing.four, paddingBottom: 72 },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, gap: Spacing.two },
  rowOpen: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Sized for up to three digits (most hymnals) and kept tight so titles get the room.
  num: { minWidth: 26, fontSize: 15, lineHeight: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  title: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  icon: { padding: 4 },
  sep: { height: 1, backgroundColor: '#33271B' },
  empty: { color: Palette.muted, fontSize: 14, lineHeight: 20, paddingVertical: Spacing.four, textAlign: 'center' },
});
