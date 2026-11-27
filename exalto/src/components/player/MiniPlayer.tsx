import { Pressable, StyleSheet, View } from "react-native";
import { Pause, Play } from "lucide-react-native";

import { useAudio } from "@/hooks/use-audio";
import { MiniPlayerHeight, Palette, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useLocale } from "@/context/locale-context";

// Pure content — no background or border radius; the parent container handles shape.
// The expand target and the play button are siblings (never nested): nested buttons are
// invalid HTML on web, and on native an accessible parent hides its children from screen readers.
export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const { currentHymn, isPlaying, play, pause, activeSoundStyle } = useAudio();
  const { t } = useLocale();

  if (!currentHymn) return null;
  // Hymns without a recording yet (lyrics only) have nothing to play.
  const hasRecording = !!(currentHymn.audioUri || currentHymn.acapellaUri);

  return (
    <View style={styles.row}>
      <Pressable onPress={onExpand} style={styles.expand} accessibilityRole="button" accessibilityLabel={currentHymn.title}>
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
      </Pressable>

      {/* Only hymns with a recording get a play button; the rest just open their lyrics. */}
      {hasRecording ? (
        <Pressable
          onPress={() => (isPlaying ? pause() : play())}
          style={styles.btn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(isPlaying ? "player.pause" : "player.play")}
        >
          {isPlaying ? <Pause size={28} color={Palette.cyan} fill={Palette.cyan} /> : <Play size={28} color={Palette.cyan} fill={Palette.cyan} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: MiniPlayerHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: Spacing.three,
    gap: Spacing.three,
  },
  // Fills the bar up to the play button, edge to edge, so the whole bar still opens the player.
  expand: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.three,
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
