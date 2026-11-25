import { LinearGradient } from "expo-linear-gradient";
import { Heart, Play } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SearchModal } from "@/components/SearchModal";
import { ThemedText } from "@/components/themed-text";
import { AppHeader } from "@/components/ui/app-header";
import { GradientBorder } from "@/components/ui/gradient-border";
import { HymnArt } from "@/components/ui/hymn-art";
import { BottomTabInset, BrandGradient, MiniPlayerHeight, Palette, Spacing } from "@/constants/theme";
import type { Hymn } from "@/context/audio-context";
import { useFavorites } from "@/context/favorites-context";
import { pickHymnOfTheDay, useHymns } from "@/context/hymns-context";
import { useHymnals } from "@/data/hymnals";
import { useAudio } from "@/hooks/use-audio";
import { useLocale } from "@/context/locale-context";

export default function HomeScreen() {
  const { loadHymn, isPlayerVisible } = useAudio();
  const [searchOpen, setSearchOpen] = useState(false);
  const { hymns, byHymnal, loading } = useHymns();
  const { isFavorite, toggle } = useFavorites();
  const { t } = useLocale();
  const hymnOfTheDay = pickHymnOfTheDay(byHymnal("idc-himnario"));
  // Placeholders until play history and play counts are recorded.
  const recentlyPlayed = hymns.slice(1, 7);
  const popular = byHymnal("canticos-espirituales").slice(0, 6);
  // Published hymns from community hymnals (hidden hymnals are already filtered out of `hymns`).
  const hymnals = useHymnals();
  const communityIds = new Set(hymnals.filter((h) => h.kind === "community" && h.visible).map((h) => h.id));
  const community = hymns.filter((h) => h.hymnalId && communityIds.has(h.hymnalId)).slice(0, 10);

  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.four;

  function open(hymn: Hymn, list: Hymn[]) {
    loadHymn(hymn, list, Math.max(0, list.indexOf(hymn)));
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <AppHeader onSearch={() => setSearchOpen(true)} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
          <ThemedText style={styles.greeting}>{t("home.greeting", { name: "Anthony" })}</ThemedText>

          {hymnOfTheDay ? (
            <Pressable onPress={() => open(hymnOfTheDay, [hymnOfTheDay])} accessibilityRole="button" accessibilityLabel={`Hymn of the day: ${hymnOfTheDay.title}`}>
              <GradientBorder radius={18} fill={Palette.bg} style={styles.featured}>
                <HymnArt seed={hymnOfTheDay.id} size={1000} radius={0} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
                  <ThemedText style={styles.badgeText}>{t("home.hymnOfTheDay")}</ThemedText>
                </LinearGradient>
                <View style={styles.featuredFooter}>
                  <View style={styles.flex}>
                    <ThemedText style={styles.featuredTitle} numberOfLines={1}>
                      {hymnOfTheDay.title}
                    </ThemedText>
                    <ThemedText style={styles.featuredSub} numberOfLines={1}>
                      {hymnOfTheDay.label ? `${t("home.hymnLabel", { label: hymnOfTheDay.label })} · ` : ""}
                      {hymnOfTheDay.artist}
                    </ThemedText>
                  </View>
                  <Play size={30} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </GradientBorder>
            </Pressable>
          ) : (
            <View style={[styles.featured, styles.placeholder]}>
              <ThemedText style={styles.muted}>{loading ? t("home.loadingToday") : t("home.noHymns")}</ThemedText>
            </View>
          )}

          <ThemedText style={styles.sectionTitle}>{t("home.recentlyPlayed")}</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
            {recentlyPlayed.map((h) => (
              <Pressable key={h.id} onPress={() => open(h, recentlyPlayed)} style={styles.tile}>
                <HymnArt seed={h.id} size={140} radius={16} />
                <View style={styles.tileText}>
                  <ThemedText style={styles.tileTitle} numberOfLines={1}>
                    {h.title}
                  </ThemedText>
                  <ThemedText style={styles.tileSub} numberOfLines={1}>
                    {h.artist}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {community.length > 0 && (
            <>
              <ThemedText style={styles.sectionTitle}>{t("home.community")}</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
                {community.map((h) => (
                  <Pressable key={h.id} onPress={() => open(h, community)} style={styles.tile} accessibilityRole="button" accessibilityLabel={h.title}>
                    <HymnArt seed={h.id} size={140} radius={16} />
                    <View style={styles.tileText}>
                      <ThemedText style={styles.tileTitle} numberOfLines={1}>
                        {h.title}
                      </ThemedText>
                      <ThemedText style={styles.tileSub} numberOfLines={1}>
                        {h.artist}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          <ThemedText style={styles.sectionTitle}>{t("home.popular")}</ThemedText>
          <View style={styles.chart}>
            {popular.map((h) => (
              <Pressable key={h.id} onPress={() => open(h, popular)} style={styles.chartRow}>
                <HymnArt seed={h.id} size={56} radius={12} />
                <View style={styles.flex}>
                  <ThemedText style={styles.chartTitle} numberOfLines={1}>
                    {h.title}
                  </ThemedText>
                  <ThemedText style={styles.tileSub} numberOfLines={1}>
                    {h.artist}
                  </ThemedText>
                </View>
                <Pressable onPress={() => toggle(h.id)} hitSlop={10} accessibilityLabel={t(isFavorite(h.id) ? "home.unlike" : "home.like", { title: h.title })}>
                  <Heart size={24} color={Palette.cyan} fill={isFavorite(h.id) ? Palette.cyan : "transparent"} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.four + 4, gap: Spacing.three },
  greeting: { color: Palette.text, fontSize: 28, lineHeight: 36, fontWeight: "800", marginBottom: Spacing.one },
  featured: { height: 182, overflow: "hidden" },
  placeholder: { borderRadius: 18, backgroundColor: Palette.surface, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 12, left: 12, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { color: "#FFFFFF", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.6 },
  featuredFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: "rgba(26,18,10,0.35)",
  },
  featuredTitle: { color: "#FFFFFF", fontSize: 18, lineHeight: 24, fontWeight: "800" },
  featuredSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, lineHeight: 15, fontWeight: "500" },
  sectionTitle: { color: Palette.text, fontSize: 20, lineHeight: 26, fontWeight: "800", marginTop: Spacing.two },
  tiles: { gap: Spacing.three + 4 },
  tile: { width: 140, gap: Spacing.two },
  tileText: { paddingHorizontal: Spacing.two },
  tileTitle: { color: Palette.text, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  tileSub: { color: Palette.muted, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  chart: { gap: Spacing.three },
  chartRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three + 4 },
  chartTitle: { color: Palette.text, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  muted: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
});
