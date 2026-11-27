import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, Play } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchModal } from '@/components/SearchModal';
import { ThemedText } from '@/components/themed-text';
import { AppHeader } from '@/components/ui/app-header';
import { ComposerAvatar } from '@/components/ui/composer-avatar';
import { HymnArt } from '@/components/ui/hymn-art';
import { withTabTransition } from '@/components/ui/transitions';
import { BottomTabInset, BrandGradient, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import { hasRecording, type Hymn } from '@/context/audio-context';
import { useAuth } from '@/context/auth-context';
import { pickHymnOfTheDay, useHymns } from '@/context/hymns-context';
import { useLocale } from '@/context/locale-context';
import { useHymnals } from '@/data/hymnals';
import { useAudio } from '@/hooks/use-audio';
import { useComposers } from '@/hooks/use-composers';

/** Horizontal rows show this many hymns; the full lists live in the Hymns tab. */
const ROW_LIMIT = 20;
const COMMUNITY_LIMIT = 10;

export default withTabTransition(DiscoverScreen, 2);

function DiscoverScreen() {
  const { hymns, loading } = useHymns();
  const hymnals = useHymnals();
  const { loadHymn, isPlayerVisible } = useAudio();
  const insets = useSafeAreaInsets();
  const { openComposer } = useAuth();
  const { t, plural } = useLocale();
  const [searchOpen, setSearchOpen] = useState(false);
  /** null = "For you"; otherwise a hymnal id. */
  const [filter, setFilter] = useState<string | null>(null);

  // Hymnals that are shown and have at least one published hymn.
  const shelf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hymns) if (h.hymnalId) counts.set(h.hymnalId, (counts.get(h.hymnalId) ?? 0) + 1);
    return hymnals.filter((h) => h.visible && counts.has(h.id)).map((h) => ({ hymnal: h, count: counts.get(h.id)! }));
  }, [hymns, hymnals]);

  const selected = filter ? shelf.find((s) => s.hymnal.id === filter)?.hymnal : undefined;
  const pool = useMemo(() => (selected ? hymns.filter((h) => h.hymnalId === selected.id) : hymns), [hymns, selected]);
  const withPractice = useMemo(() => pool.filter((h) => h.practice), [pool]);
  const withRecording = useMemo(() => pool.filter(hasRecording), [pool]);
  const community = useMemo(() => {
    const ids = new Set(hymnals.filter((h) => h.kind === 'community' && h.visible).map((h) => h.id));
    return hymns.filter((h) => h.hymnalId && ids.has(h.hymnalId)).slice(0, COMMUNITY_LIMIT);
  }, [hymns, hymnals]);

  // Featured: a hymn to practice today, else one to listen to. Offset by a day so it isn't Home's hymn of the day.
  const tomorrow = new Date(Date.now() + 86_400_000);
  const featured = pickHymnOfTheDay(withPractice, tomorrow) ?? pickHymnOfTheDay(withRecording, tomorrow);

  const composers = useComposers(hymns, hymnals);

  // "For you" lists community hymns below; a hymnal chip lists every hymn in that hymnal.
  const list = selected ? pool : community;
  const listTitle = selected ? t('discover.inHymnal', { name: selected.name }) : t('discover.community');

  // Clears the tab bar, the home indicator (the tab bar sits above it) and the mini player when it's showing.
  const bottomPad = BottomTabInset + insets.bottom + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.five;

  function open(hymn: Hymn, from: Hymn[]) {
    // Follows the Auto-play setting: plays a recording, otherwise opens the lyrics.
    loadHymn(hymn, from, Math.max(0, from.indexOf(hymn)));
  }

  const empty = !loading && hymns.length === 0;

  const header = (
    <View style={styles.header}>
      {shelf.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.bleed}>
          <Chip label={t('discover.forYou')} active={!selected} onPress={() => setFilter(null)} />
          {shelf.map(({ hymnal }) => (
            <Chip
              key={hymnal.id}
              label={hymnal.shortName || hymnal.name}
              a11y={t('discover.filterBy', { name: hymnal.name })}
              active={selected?.id === hymnal.id}
              onPress={() => setFilter(hymnal.id)}
            />
          ))}
        </ScrollView>
      )}

      {featured && (
        <Pressable onPress={() => open(featured, [featured])} accessibilityRole="button" accessibilityLabel={featured.title} style={styles.hero}>
          <HymnArt seed={featured.id} hymnalId={featured.hymnalId} size={1000} radius={0} watermark style={styles.heroArt} />
          <LinearGradient colors={['rgba(26,18,10,0)', 'rgba(26,18,10,0.85)']} style={StyleSheet.absoluteFill} />
          <View style={styles.heroBody}>
            <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
              <ThemedText style={styles.badgeText}>{featured.practice ? t('discover.featuredPractice') : t('discover.featuredListen')}</ThemedText>
            </LinearGradient>
            <ThemedText style={styles.heroTitle} numberOfLines={1}>
              {featured.title}
            </ThemedText>
            <ThemedText style={styles.heroSub} numberOfLines={1}>
              {featured.label ? `${t('home.hymnLabel', { label: featured.label })} · ` : ''}
              {featured.artist}
            </ThemedText>
          </View>
        </Pressable>
      )}

      {!selected && shelf.length > 1 && (
        <Section title={t('discover.hymnals')}>
          <FlatList
            horizontal
            data={shelf}
            keyExtractor={(s) => s.hymnal.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tiles}
            style={styles.bleed}
            renderItem={({ item }) => (
              <Pressable onPress={() => setFilter(item.hymnal.id)} style={styles.hymnalTile} accessibilityRole="button" accessibilityLabel={item.hymnal.name}>
                <HymnArt seed={item.hymnal.id} hymnalId={item.hymnal.id} size={120} radius={16} />
                <ThemedText style={styles.tileTitle} numberOfLines={1}>
                  {item.hymnal.name}
                </ThemedText>
                <ThemedText style={styles.tileSub} numberOfLines={1}>
                  {plural('library.count', item.count)}
                </ThemedText>
              </Pressable>
            )}
          />
        </Section>
      )}

      {!selected && composers.length > 0 && (
        <Section title={t('discover.composers')}>
          <FlatList
            horizontal
            data={composers}
            keyExtractor={(c) => c.uid}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tiles}
            style={styles.bleed}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openComposer(item.uid)}
                style={styles.composer}
                accessibilityRole="button"
                accessibilityLabel={t('discover.openComposer', { name: item.name })}>
                <ComposerAvatar name={item.name} photoURL={item.photoURL} />
                <ThemedText style={styles.composerName} numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText style={styles.tileSub} numberOfLines={1}>
                  {plural('library.count', item.count)}
                </ThemedText>
              </Pressable>
            )}
          />
        </Section>
      )}

      {withPractice.length > 0 && (
        <Section title={t('discover.practice')}>
          <HymnRow hymns={withPractice.slice(0, ROW_LIMIT)} onOpen={open} />
        </Section>
      )}

      {withRecording.length > 0 && (
        <Section title={t('discover.recordings')}>
          <HymnRow hymns={withRecording.slice(0, ROW_LIMIT)} onOpen={open} />
        </Section>
      )}

      {list.length > 0 && <ThemedText style={styles.sectionTitle}>{listTitle}</ThemedText>}
    </View>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <AppHeader title={t('discover.title')} onSearch={() => setSearchOpen(true)} />
        {loading && hymns.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.cyan} />
            <ThemedText style={styles.tileSub}>{t('discover.loading')}</ThemedText>
          </View>
        ) : empty ? (
          <View style={styles.center}>
            <ThemedText style={styles.tileSub}>{t('discover.empty')}</ThemedText>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(h) => h.id}
            ListHeaderComponent={header}
            contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            windowSize={7}
            renderItem={({ item }) => (
              <Pressable onPress={() => open(item, list)} style={styles.row} accessibilityRole="button" accessibilityLabel={item.title}>
                <HymnArt seed={item.id} hymnalId={item.hymnalId} size={48} radius={12} label={item.label} />
                <View style={styles.flex}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.tileSub} numberOfLines={1}>
                    {item.artist}
                  </ThemedText>
                </View>
                {hasRecording(item) ? <Play size={20} color={Palette.text} fill={Palette.text} /> : <BookOpen size={20} color={Palette.muted} />}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

function Chip({ label, active, onPress, a11y }: { label: string; active: boolean; onPress: () => void; a11y?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={a11y ?? label}>
      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

function HymnRow({ hymns, onOpen }: { hymns: Hymn[]; onOpen: (h: Hymn, list: Hymn[]) => void }) {
  return (
    <FlatList
      horizontal
      data={hymns}
      keyExtractor={(h) => h.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tiles}
      style={styles.bleed}
      initialNumToRender={4}
      renderItem={({ item }) => (
        <Pressable onPress={() => onOpen(item, hymns)} style={styles.tile} accessibilityRole="button" accessibilityLabel={item.title}>
          <HymnArt seed={item.id} hymnalId={item.hymnalId} size={140} radius={16} label={item.label} />
          <View style={styles.tileText}>
            <ThemedText style={styles.tileTitle} numberOfLines={1}>
              {item.title}
            </ThemedText>
            <ThemedText style={styles.tileSub} numberOfLines={1}>
              {item.artist}
            </ThemedText>
          </View>
        </Pressable>
      )}
    />
  );
}

const GUTTER = Spacing.four + 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  content: { paddingHorizontal: GUTTER, gap: Spacing.three },
  header: { gap: Spacing.three },
  // Horizontal rows scroll edge to edge but start in line with the page.
  bleed: { marginHorizontal: -GUTTER },
  chips: { gap: Spacing.two, paddingHorizontal: GUTTER },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Palette.pill },
  chipActive: { backgroundColor: Palette.cyan },
  chipText: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  chipTextActive: { color: '#04131B' },
  // Fills the card (a cover image would otherwise show only the top-left of a 1000px box).
  heroArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: 'auto', height: 'auto' },
  hero: { height: 150, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(4,193,255,0.33)', justifyContent: 'flex-end' },
  heroBody: { padding: Spacing.three + 2, gap: Spacing.one },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: Palette.bg, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.76 },
  heroTitle: { color: Palette.text, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  heroSub: { color: 'rgba(240,224,209,0.8)', fontSize: 12, lineHeight: 16 },
  section: { gap: Spacing.three },
  sectionTitle: { color: Palette.text, fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: Spacing.two },
  tiles: { gap: Spacing.three + 4, paddingHorizontal: GUTTER },
  tile: { width: 140, gap: Spacing.two },
  tileText: { paddingHorizontal: Spacing.two },
  hymnalTile: { width: 120, gap: Spacing.one },
  tileTitle: { color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  tileSub: { color: Palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  composer: { width: 76, alignItems: 'center', gap: Spacing.one },
  composerName: { color: Palette.text, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three + 4 },
  rowTitle: { color: Palette.text, fontSize: 16, lineHeight: 21, fontWeight: '500' },
});
