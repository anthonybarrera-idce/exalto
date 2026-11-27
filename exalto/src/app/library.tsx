import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Heart, Plus, ThumbsUp } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaylistDetail, PlaylistEditor } from '@/components/playlists/PlaylistDetail';
import { PlaylistArt } from '@/components/playlists/ui';
import { PageStack, withTabTransition } from '@/components/ui/transitions';
import { ThemedText } from '@/components/themed-text';
import { AppHeader } from '@/components/ui/app-header';
import { HymnArt } from '@/components/ui/hymn-art';
import { BottomTabInset, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useFavorites } from '@/context/favorites-context';
import { useHymns } from '@/context/hymns-context';
import { useAudio } from '@/hooks/use-audio';
import { useLocale } from '@/context/locale-context';
import { usePlaylists } from '@/context/playlists-context';

export default withTabTransition(LibraryScreen, 3);

function LibraryScreen() {
  const { hymns } = useHymns();
  const { ids, toggle } = useFavorites();
  const { loadHymn, isPlayerVisible } = useAudio();
  const { t, plural } = useLocale();
  const { playlists, synced, openMenu } = usePlaylists();
  // A playlist opens in place of the list ('new' = the create form).
  const [openId, setOpenId] = useState<string | null>(null);

  const byId = new Map(hymns.map((h) => [h.id, h]));
  const liked = ids.map((id) => byId.get(id)).filter((h): h is Hymn => Boolean(h));
  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.four;

  function open(hymn: Hymn) {
    // Plays if "Auto-play recordings" is on and the hymn has one; otherwise opens the lyrics.
    loadHymn(hymn, liked, liked.indexOf(hymn));
  }

  // A playlist opens in place of the list, sliding in like a pushed screen.
  return <PageStack page={openId ?? LIST} depthOf={(p) => (p === LIST ? 0 : 1)} renderPage={renderPage} pageStyle={styles.root} />;

  function renderPage(page: string) {
    if (page !== LIST) {
      return (
        <SafeAreaView style={styles.flex} edges={['top']}>
          {page === 'new' ? (
            <PlaylistEditor onDone={() => setOpenId(null)} onCreated={setOpenId} />
          ) : (
            <PlaylistDetail key={page} id={page} onBack={() => setOpenId(null)} />
          )}
        </SafeAreaView>
      );
    }
    return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <AppHeader title={t('library.title')} />
        <FlatList
          data={liked}
          keyExtractor={(h) => h.id}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          ListHeaderComponent={
            <>
            <View style={styles.playlists}>
              <ThemedText style={styles.section} accessibilityRole="header">{t('playlists.title')}</ThemedText>
              <Pressable onPress={() => setOpenId('new')} style={styles.newRow} accessibilityRole="button">
                <Plus size={18} color={Palette.cyan} />
                <ThemedText style={styles.newText}>{t('playlists.new')}</ThemedText>
              </Pressable>
              {playlists.map((p) => (
                <Pressable key={p.id} onPress={() => setOpenId(p.id)} style={styles.row} accessibilityRole="button" accessibilityLabel={t('playlists.open', { name: p.name })}>
                  <PlaylistArt size={48} radius={12} />
                  <View style={styles.flex}>
                    <ThemedText style={styles.rowTitle} numberOfLines={1}>{p.name}</ThemedText>
                    <ThemedText style={styles.rowSub}>{plural('library.count', p.hymnIds.length)}</ThemedText>
                  </View>
                  <ChevronRight size={18} color={Palette.muted} />
                </Pressable>
              ))}
              {playlists.length && !synced ? <ThemedText style={styles.rowSub}>{t('playlists.guestNote')}</ThemedText> : null}
            </View>
            <View style={styles.collection}>
              <LinearGradient colors={['#0F6F95', '#04C1FF', '#EDA145']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.collectionArt}>
                <ThumbsUp size={24} color="#FFFFFF" strokeWidth={1.8} />
              </LinearGradient>
              <View style={styles.flex}>
                <ThemedText style={styles.rowTitle}>{t('library.liked')}</ThemedText>
                <ThemedText style={styles.rowSub}>
                  {plural('library.count', liked.length)}
                </ThemedText>
              </View>
            </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText style={styles.emptyTitle}>{t('library.emptyTitle')}</ThemedText>
              <ThemedText style={styles.rowSub}>{t('library.emptyBody')}</ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            // Row and heart are siblings, not nested buttons.
            <View style={styles.row}>
              <Pressable style={styles.rowOpen} onPress={() => open(item)} onLongPress={() => openMenu(item)} accessibilityRole="button" accessibilityLabel={item.title}>
                <HymnArt seed={item.id} hymnalId={item.hymnalId} size={48} radius={12} label={item.label} />
                <View style={styles.flex}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.rowSub} numberOfLines={1}>
                    {item.artist}
                  </ThemedText>
                </View>
              </Pressable>
              <Pressable onPress={() => toggle(item.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('library.remove', { title: item.title })}>
                <Heart size={22} color={Palette.cyan} fill={Palette.cyan} />
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    </View>
    );
  }
}

/** The list itself, in the page stack (playlist ids never start with a slash). */
const LIST = '/list';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.four + 4, gap: Spacing.three },
  playlists: { gap: Spacing.three, marginBottom: Spacing.four },
  section: { color: Palette.text, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 32 },
  newText: { color: Palette.cyan, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  collection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, marginBottom: Spacing.three },
  collectionArt: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three + 4 },
  rowOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three + 4 },
  rowTitle: { color: Palette.text, fontSize: 16, lineHeight: 21, fontWeight: '500' },
  rowSub: { color: Palette.muted, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  empty: { paddingVertical: Spacing.five, gap: Spacing.one, alignItems: 'center' },
  emptyTitle: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
