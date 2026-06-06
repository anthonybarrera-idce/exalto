import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";

import { useAudio } from "@/hooks/use-audio";
import { MiniPlayerHeight, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";

// Pure content — no background or border radius; the parent container handles shape.
export function MiniPlayer() {
  const { currentHymn, isPlaying, play, pause, skipNext } = useAudio();

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
        </ThemedText>
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          isPlaying ? pause() : play();
        }}
        style={styles.btn}
        hitSlop={8}
      >
        <SymbolView
          name={isPlaying ? "pause.fill" : "play.fill"}
          size={20}
          tintColor="#FFFFFF"
        />
      </Pressable>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          skipNext();
        }}
        style={styles.btn}
        hitSlop={8}
      >
        <SymbolView name="forward.fill" size={18} tintColor="#FFFFFF" />
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
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  artist: {
    color: "#A09080",
    fontSize: 12,
  },
  btn: {
    padding: Spacing.one,
  },
});
