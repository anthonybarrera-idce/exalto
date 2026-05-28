import { Pressable, StyleSheet, View, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { useAudio } from '@/hooks/use-audio';
import { AccentColor, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 64;

function formatTime(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface FullPlayerProps {
  onClose: () => void;
}

export function FullPlayer({ onClose }: FullPlayerProps) {
  const insets = useSafeAreaInsets();
  const {
    currentHymn,
    isPlaying,
    positionSecs,
    durationSecs,
    isLiked,
    repeatMode,
    shuffleEnabled,
    play,
    pause,
    seekTo,
    skipNext,
    skipPrevious,
    toggleLike,
    setRepeatMode,
    toggleShuffle,
  } = useAudio();

  if (!currentHymn) return null;

  const progress = durationSecs > 0 ? positionSecs / durationSecs : 0;

  function cycleRepeat() {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.three }]}>
      {/* Drag handle */}
      <View style={styles.dragHandle} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <ThemedText style={styles.headerLabel}>Now Playing</ThemedText>
        <Pressable onPress={onClose} hitSlop={8} style={styles.headerSpacer}>
          <SymbolView name="chevron.down" size={20} tintColor="#A09080" />
        </Pressable>
      </View>

      {/* Artwork */}
      <View style={[styles.artwork, { backgroundColor: currentHymn.artworkColor ?? AccentColor }]}>
        {currentHymn.hymnNumber && (
          <ThemedText style={styles.hymnNumberText}>#{currentHymn.hymnNumber}</ThemedText>
        )}
      </View>

      {/* Title + Like */}
      <View style={styles.titleRow}>
        <View style={styles.titleInfo}>
          <ThemedText style={styles.songTitle} numberOfLines={1}>
            {currentHymn.title}
          </ThemedText>
          <ThemedText style={styles.artistName} numberOfLines={1}>
            {currentHymn.artist}
          </ThemedText>
        </View>
        <Pressable onPress={toggleLike} hitSlop={8}>
          <SymbolView
            name={isLiked ? 'heart.fill' : 'heart'}
            size={22}
            tintColor={isLiked ? AccentColor : '#A09080'}
          />
        </Pressable>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <Pressable
          style={styles.progressTrack}
          onPress={(e) => {
            const tapX = e.nativeEvent.locationX;
            // Use a default width if layout hasn't reported yet
            const trackWidth = SCREEN_WIDTH - 64;
            const ratio = Math.min(Math.max(tapX / trackWidth, 0), 1);
            seekTo(ratio * durationSecs);
          }}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
        </Pressable>
        <View style={styles.timeRow}>
          <ThemedText style={styles.timeText}>{formatTime(positionSecs)}</ThemedText>
          <ThemedText style={styles.timeText}>-{formatTime(durationSecs - positionSecs)}</ThemedText>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable onPress={toggleShuffle} hitSlop={8}>
          <SymbolView
            name="shuffle"
            size={20}
            tintColor={shuffleEnabled ? AccentColor : '#55504A'}
          />
        </Pressable>

        <Pressable onPress={skipPrevious} hitSlop={8}>
          <SymbolView name="backward.fill" size={28} tintColor="#FFFFFF" />
        </Pressable>

        <Pressable
          style={styles.playButton}
          onPress={isPlaying ? pause : play}>
          <SymbolView
            name={isPlaying ? 'pause.fill' : 'play.fill'}
            size={30}
            tintColor="#FFFFFF"
          />
        </Pressable>

        <Pressable onPress={skipNext} hitSlop={8}>
          <SymbolView name="forward.fill" size={28} tintColor="#FFFFFF" />
        </Pressable>

        <Pressable onPress={cycleRepeat} hitSlop={8}>
          <SymbolView
            name={repeatMode === 'one' ? 'repeat.1' : 'repeat'}
            size={20}
            tintColor={repeatMode !== 'off' ? AccentColor : '#55504A'}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A2C20',
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.four,
  },
  headerSpacer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 16,
    marginBottom: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hymnNumberText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 48,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.four,
    gap: Spacing.three,
  },
  titleInfo: {
    flex: 1,
    gap: 4,
  },
  songTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  artistName: {
    color: '#A09080',
    fontSize: 16,
  },
  progressSection: {
    width: '100%',
    marginBottom: Spacing.five,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#3A2C20',
    borderRadius: 2,
    marginBottom: Spacing.two,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AccentColor,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    marginLeft: -7,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#A09080',
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
