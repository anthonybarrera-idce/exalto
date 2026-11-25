import { Pressable, StyleSheet, View } from "react-native";
import { Pause, Play } from "lucide-react-native";

import { useAudio } from "@/hooks/use-audio";
import { MiniPlayerHeight, Palette, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useLocale } from "@/context/locale-context";

// Pure content — no background or border radius; the parent container handles shape.
export function MiniPlayer() {
  const { currentHymn, isPlaying, play, pause, activeSoundStyle } = useAudio();
  const { t } = useLocale();

  if (!currentHymn) return null;

  return (
    <View style={styles.row}>
      {/* Transparent placeholder — the floating artwork in PlayerModal covers this */}
      <View style={styles.artwork} />

      <View style={styles.info}>
        <ThemedText numberOfLines={1} style={styles.title}>
          {currentHymn.title}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.artist}>
          {currentHymn.artist}
          {currentHymn.acapellaUri && activeSoundStyle === "acapella" ? ` · ${t("player.acapella")}` : ""}
        </ThemedText>
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          if (!currentHymn.audioUri && !currentHymn.acapellaUri) return;
          isPlaying ? pause() : play();
        }}
        style={styles.btn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(isPlaying ? "player.pause" : "player.play")}
      >
        {isPlaying ? (
          <Pause size={28} color={Palette.cyan} fill={Palette.cyan} />
        ) : (
          <Play size={28} color={Palette.cyan} fill={Palette.cyan} opacity={currentHymn.audioUri ? 1 : 0.35} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: MiniPlayerHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 8,
    opacity: 0.85,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: Palette.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  artist: {
    color: Palette.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  btn: {
    padding: Spacing.one,
  },
});
