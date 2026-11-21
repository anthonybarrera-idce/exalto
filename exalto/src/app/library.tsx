import { LinearGradient } from 'expo-linear-gradient';
import { Heart, ThumbsUp } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { AppHeader } from '@/components/ui/app-header';
import { HymnArt } from '@/components/ui/hymn-art';
import { BottomTabInset, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useFavorites } from '@/context/favorites-context';
import { useHymns } from '@/context/hymns-context';
import { useViewMode } from '@/context/view-mode-context';
import { useAudio } from '@/hooks/use-audio';

export default function LibraryScreen() {
  const { hymns } = useHymns();
  const { ids, toggle } = useFavorites();
  const { loadHymn, expandPlayer, isPlayerVisible } = useAudio();
  const { setViewMode } = useViewMode();

  const byId = new Map(hymns.map((h) => [h.id, h]));
  const liked = ids.map((id) => byId.get(id)).filter((h): h is Hymn => Boolean(h));
  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.four;

  function open(hymn: Hymn) {
    if (!hymn.audioUri) setViewMode('hymnal');
    loadHymn(hymn, liked, liked.indexOf(hymn));
    if (!hymn.audioUri) expandPlayer();
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <AppHeader title="Library" />
        <FlatList
          data={liked}
          keyExtractor={(h) => h.id}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          ListHeaderComponent={
            <View style={styles.collection}>
              <LinearGradient colors={['#0F6F95', '#04C1FF', '#EDA145']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.collectionArt}>
                <ThumbsUp size={24} color="#FFFFFF" strokeWidth={1.8} />
              </LinearGradient>
              <View style={styles.flex}>
                <ThemedText style={styles.rowTitle}>Liked Hymns</ThemedText>
                <ThemedText style={styles.rowSub}>
                  {liked.length} hymn{liked.length === 1 ? '' : 's'}
                </ThemedText>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText style={styles.emptyTitle}>Save hymns you love</ThemedText>
              <ThemedText style={styles.rowSub}>Tap the heart on any hymn and it shows up here.</ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={item.title}>
              <HymnArt seed={item.id} size={48} radius={12} label={item.label} />
              <View style={styles.flex}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText style={styles.rowSub} numberOfLines={1}>
                  {item.artist}
                </ThemedText>
              </View>
              <Pressable onPress={() => toggle(item.id)} hitSlop={10} accessibilityLabel={`Remove ${item.title} from liked hymns`}>
                <Heart size={22} color={Palette.cyan} fill={Palette.cyan} />
              </Pressable>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.four + 4, gap: Spacing.three },
  collection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, marginBottom: Spacing.three },
  collectionArt: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three + 4 },
  rowTitle: { color: Palette.text, fontSize: 16, lineHeight: 21, fontWeight: '500' },
  rowSub: { color: Palette.muted, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  empty: { paddingVertical: Spacing.five, gap: Spacing.one, alignItems: 'center' },
  emptyTitle: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
