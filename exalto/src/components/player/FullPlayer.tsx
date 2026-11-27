import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp, Cast, Download, FileText, Heart, ListMusic, ListPlus, MoreVertical, Pause, Play, Repeat, Repeat1, Share2, Shuffle, SkipBack, SkipForward, ThumbsUp, type LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import Animated, { LayoutAnimationConfig, useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { MODE_SWITCHER_HEIGHT, ModeSwitcher } from '@/components/ModeSwitcher';
import { useAudio } from '@/hooks/use-audio';
import { useFavorites } from '@/context/favorites-context';
import { usePlaylists } from '@/context/playlists-context';
import { useLocale, useSectionLabel } from '@/context/locale-context';

/** Like state for the hymn that's open, backed by on-device favorites. */
function useLike(id: string | undefined) {
  const { isFavorite, toggle } = useFavorites();
  return { isLiked: id ? isFavorite(id) : false, toggleLike: () => id && toggle(id) };
}
import { hymnModes, useViewMode } from '@/context/view-mode-context';
import { LyricSection } from '@/context/audio-context';
import { AccentColor, BrandGradient, Palette, Spacing } from '@/constants/theme';
import { HymnArt } from '@/components/ui/hymn-art';
import { PracticePanel } from '@/components/practice/PracticeModal';
import { SoundStyleToggle } from '@/components/player/SoundStyleToggle';
import { contentFadeIn } from '@/components/ui/transitions';
import { PLAYER_ART_MAX, PLAYER_CONTENT_MAX, playerAreaWidth } from '@/hooks/use-desktop';

// The screen width on phones; on web, the column the player sits in (desktop / tablet-size windows).
const SCREEN_WIDTH = playerAreaWidth();
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 68, PLAYER_ART_MAX); // SCREEN_WIDTH - H_INSET*2 - paddingHorizontal*2, capped on wide web windows

function formatTime(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface FullPlayerProps {
  onClose: () => void;
}

interface RootProps extends FullPlayerProps {
  /** Drag-to-dismiss, attached to the handle and top bar so it doesn't fight the lyrics scroll. */
  dragGesture?: GestureType;
  /** How far the Listen view is scrolled, so the floating artwork (drawn above it) moves with the content. */
  artScrollY?: SharedValue<number>;
}

// ─── Audio mode ─────────────────────────────────────────────────────────────

function AudioView({ onClose, artScrollY }: FullPlayerProps & { artScrollY?: SharedValue<number> }) {
  const {
    currentHymn,
    isPlaying,
    positionSecs,
    durationSecs,
    repeatMode,
    shuffleEnabled,
    play,
    pause,
    seekTo,
    skipNext,
    skipPrevious,
    setRepeatMode,
    toggleShuffle,
    openQueue,
  } = useAudio();
  const onScroll = useAnimatedScrollHandler((e) => {
    if (artScrollY) artScrollY.value = e.contentOffset.y;
  });
  // Leaving the Listen view (or closing) puts the artwork back in place.
  useEffect(() => () => {
    if (artScrollY) artScrollY.value = 0;
  }, [artScrollY]);
  const { openPicker } = usePlaylists();
  const [trackWidth, setTrackWidth] = useState(0);
  const { isLiked, toggleLike } = useLike(currentHymn?.id);
  const { t } = useLocale();

  if (!currentHymn) return null;

  const progress = durationSecs > 0 ? positionSecs / durationSecs : 0;

  function cycleRepeat() {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  }

  const displayTitle = currentHymn.label ? `${currentHymn.label} ${currentHymn.title}` : currentHymn.title;

  return (
    <Animated.ScrollView
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.audioScroll}>
      {/* Transparent placeholder — floating artwork in PlayerModal covers this */}
      <View style={styles.artwork} />

      {/* Title + artist + like */}
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <ThemedText style={styles.songTitle} numberOfLines={2}>
            {displayTitle}
          </ThemedText>
          <Pressable onPress={toggleLike} hitSlop={8}>
            <Heart size={22} color={isLiked ? Palette.cyan : Palette.muted} fill={isLiked ? Palette.cyan : 'transparent'} />
          </Pressable>
        </View>
        <ThemedText style={styles.artistName}>{currentHymn.artist}</ThemedText>
      </View>

      {/* Piano / A cappella, when the hymn has both recordings */}
      <SoundStyleToggle />

      {/* Action pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionRow}>
        <ActionPill Icon={ThumbsUp} label={t('player.like')} onPress={toggleLike} />
        <ActionPill Icon={ListPlus} label={t('player.add')} onPress={() => openPicker(currentHymn)} />
        <ActionPill Icon={ListMusic} label={t('player.queue')} onPress={openQueue} />
        <ActionPill Icon={Share2} label={t('player.share')} />
        <ActionPill Icon={Download} label={t('player.download')} />
      </ScrollView>

      {/* Progress */}
      <View style={styles.progressSection}>
        <Pressable
          style={styles.progressTrack}
          hitSlop={{ top: 12, bottom: 12 }}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            if (!trackWidth || !durationSecs) return;
            const ratio = Math.min(Math.max(e.nativeEvent.locationX / trackWidth, 0), 1);
            seekTo(ratio * durationSecs);
          }}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
        </Pressable>
        <View style={styles.timeRow}>
          <ThemedText style={styles.timeText}>{formatTime(positionSecs)}</ThemedText>
          <ThemedText style={styles.timeText}>{formatTime(durationSecs)}</ThemedText>
        </View>
      </View>

      {/* Playback controls */}
      <View style={styles.controls}>
        <Pressable onPress={toggleShuffle} hitSlop={8}>
          <Shuffle size={24} color={Palette.cyan} opacity={shuffleEnabled ? 1 : 0.55} />
        </Pressable>
        <Pressable onPress={skipPrevious} hitSlop={8}>
          <SkipBack size={30} color={Palette.cyan} fill={Palette.cyan} />
        </Pressable>
        <Pressable onPress={isPlaying ? pause : play} accessibilityRole="button" accessibilityLabel={t(isPlaying ? 'player.pause' : 'player.play')}>
          <LinearGradient colors={[Palette.cyan, '#0B4E66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.playButton}>
            {isPlaying ? <Pause size={30} color="#FFFFFF" fill="#FFFFFF" /> : <Play size={30} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 4 }} />}
          </LinearGradient>
        </Pressable>
        <Pressable onPress={skipNext} hitSlop={8}>
          <SkipForward size={30} color={Palette.cyan} fill={Palette.cyan} />
        </Pressable>
        <Pressable onPress={cycleRepeat} hitSlop={8}>
          {repeatMode === 'one' ? <Repeat1 size={24} color={Palette.cyan} /> : <Repeat size={24} color={Palette.cyan} opacity={repeatMode === 'off' ? 0.55 : 1} />}
        </Pressable>
      </View>
    </Animated.ScrollView>
  );
}

function ActionPill({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionPill}>
      <Icon size={15} color={Palette.text} strokeWidth={1.8} />
      <ThemedText style={styles.actionPillText}>{label}</ThemedText>
    </Pressable>
  );
}

// ─── Hymnal mode ─────────────────────────────────────────────────────────────

function HymnalView({ onClose }: FullPlayerProps) {
  const { currentHymn } = useAudio();
  const { openPicker } = usePlaylists();
  const { isLiked, toggleLike } = useLike(currentHymn?.id);
  const { t } = useLocale();
  const [fontSize, setFontSize] = useState(15);

  if (!currentHymn) return null;

  const displayTitle = currentHymn.label ? `${currentHymn.label} ${currentHymn.title}` : currentHymn.title;

  return (
    <View style={styles.hymnalContainer}>
      {/* Font size + right icons */}
      <View style={styles.hymnalTopActions}>
        <Pressable
          style={styles.fontBtn}
          onPress={() => setFontSize((s) => Math.min(s + 2, 24))}
          hitSlop={6}>
          <ThemedText style={styles.fontBtnText}>A</ThemedText>
          <ArrowUp size={13} color={Palette.text} strokeWidth={2} />
        </Pressable>
        <Pressable
          style={styles.fontBtn}
          onPress={() => setFontSize((s) => Math.max(s - 2, 11))}
          hitSlop={6}>
          <ThemedText style={styles.fontBtnText}>A</ThemedText>
          <ArrowDown size={13} color={Palette.text} strokeWidth={2} />
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable onPress={toggleLike} hitSlop={8}>
          <Heart size={24} color={Palette.cyan} fill={isLiked ? Palette.cyan : 'transparent'} strokeWidth={1.8} />
        </Pressable>
        <Pressable onPress={() => openPicker(currentHymn)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('playlists.addTo')}>
          <ListPlus size={24} color={Palette.text} strokeWidth={1.6} />
        </Pressable>
        <Pressable hitSlop={8}>
          <FileText size={24} color={Palette.text} strokeWidth={1.6} />
        </Pressable>
      </View>

      {/* Lyrics */}
      <ScrollView
        style={styles.lyricsScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.lyricsContent}>
        {currentHymn.lyrics?.length ? (
          currentHymn.lyrics.map((section, i) => (
            <LyricBlock key={i} section={section} fontSize={fontSize} dim={false} />
          ))
        ) : (
          <ThemedText style={[styles.noLyrics, { fontSize }]}>
            {t('lyrics.none')}
          </ThemedText>
        )}
      </ScrollView>

      {/* Bottom mini bar */}
      <View style={styles.hymnalBottom}>
        <HymnArt seed={currentHymn.id} hymnalId={currentHymn.hymnalId} size={52} radius={10} />
        <View style={styles.hymnalInfo}>
          <ThemedText style={styles.hymnalTitle} numberOfLines={1}>
            {displayTitle}
          </ThemedText>
          <ThemedText style={styles.hymnalArtist} numberOfLines={1}>
            {currentHymn.artist}
          </ThemedText>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <ThemedText style={styles.closeBtnText}>{t('player.close')}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function LyricBlock({
  section,
  fontSize,
  dim,
}: {
  section: LyricSection;
  fontSize: number;
  dim: boolean;
}) {
  const heading = useSectionLabel()(section);

  return (
    <View style={styles.lyricBlock}>
      <ThemedText style={[styles.lyricHeading, dim && styles.lyricDim]}>
        {heading}
      </ThemedText>
      <View style={styles.lyricLines}>
        {section.lines.map((line, i) => (
          <ThemedText
            key={i}
            style={[styles.lyricLine, { fontSize, lineHeight: fontSize * 1.6 }, dim && styles.lyricDim]}>
            {line}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

// ─── Root FullPlayer ─────────────────────────────────────────────────────────

/** Dev-only opt-in: show the bundled sample score for hymns without practice notes. */
const PRACTICE_SAMPLE = __DEV__ && process.env.EXPO_PUBLIC_PRACTICE_SAMPLE === '1';

export function FullPlayer({ onClose, dragGesture, artScrollY }: RootProps) {
  const { viewMode, setViewMode } = useViewMode();
  const { currentHymn, isPlaying, pause } = useAudio();
  const { openMenu } = usePlaylists();
  const { t } = useLocale();
  // Practice is offered only for a hymn's own practice notes. The bundled sample (another hymn's
  // score, labelled "Sample") stands in only in dev builds started with EXPO_PUBLIC_PRACTICE_SAMPLE=1.
  const practiceSource = currentHymn ? (currentHymn.practice ?? (PRACTICE_SAMPLE ? ('sample' as const) : null)) : null;
  // Only the modes this hymn has: Read with lyrics, Listen with a recording, Practice with notes.
  const modes = useMemo(
    () => (currentHymn ? hymnModes(currentHymn, practiceSource != null) : []),
    [currentHymn, practiceSource],
  );
  // Render the first available mode straight away when the current one isn't offered (e.g. the
  // next hymn in the queue has no recording), so there's no frame of an empty player.
  const mode = modes.length && !modes.includes(viewMode) ? modes[0] : viewMode;
  const practicing = mode === 'practice' && practiceSource != null;

  // Opening the practice tool pauses the hymn's recording, so only the practice notes sound.
  useEffect(() => {
    if (practicing && isPlaying) pause();
  }, [practicing]); // eslint-disable-line react-hooks/exhaustive-deps
  // A hymn without the current mode moves to its first available one.
  useEffect(() => {
    if (mode !== viewMode) setViewMode(mode);
  }, [mode, viewMode, setViewMode]);

  // Web has no swipe-down to close, so Listen and Practice get the Close button Read already has at the bottom.
  const webClose = Platform.OS === 'web' && mode !== 'hymnal';
  const showTopBar = modes.length > 1 || mode === 'audio' || webClose;

  const header = (
    <View collapsable={false}>
      {/* Drag handle */}
      <View style={styles.dragZone}>
        <View style={styles.dragHandle} />
      </View>

      {/* Top bar: mode switcher + right icons. Left out when there's nothing to put in it (one
          mode, not Listen), so the content starts right under the handle. Listen keeps it for its
          icons and to keep the floating artwork lined up. */}
      {showTopBar ? (
        <View style={styles.topBar}>
          <ModeSwitcher variant="inline" modes={modes} />

          <View style={{ flex: 1 }} />

          {mode === 'audio' ? (
            <>
              <Pressable hitSlop={8}>
                <Cast size={22} color={Palette.text} strokeWidth={1.6} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => currentHymn && openMenu(currentHymn)} accessibilityRole="button" accessibilityLabel={currentHymn ? t('hymns.more', { title: currentHymn.title }) : undefined}>
                <MoreVertical size={22} color={Palette.text} />
              </Pressable>
            </>
          ) : null}
          {webClose ? (
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
              <ThemedText style={styles.closeBtnText}>{t('player.close')}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {dragGesture ? <GestureDetector gesture={dragGesture}>{header}</GestureDetector> : header}

      {/* Content: a short fade when the mode changes (the floating artwork fades with it, in PlayerModal).
          No fade the first time the sheet shows a mode: the sheet's own slide covers that. */}
      <LayoutAnimationConfig skipEntering>
        <Animated.View key={practicing ? 'practice' : mode} entering={contentFadeIn} style={styles.flex}>
          {practicing && currentHymn && practiceSource ? (
            <PracticePanel key={currentHymn.id} hymnId={currentHymn.id} title={currentHymn.title} source={practiceSource} />
          ) : mode === 'hymnal' ? (
            <HymnalView onClose={onClose} />
          ) : (
            <AudioView onClose={onClose} artScrollY={artScrollY} />
          )}
        </Animated.View>
      </LayoutAnimationConfig>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  dragZone: {
    // Taller than the visible handle so it's easy to grab.
    // Same total height as before (keeps the artwork aligned) but grabbable above the handle too.
    paddingTop: Spacing.two,
    marginTop: -Spacing.two,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Same height with or without the switcher, so the floating artwork stays lined up.
    minHeight: MODE_SWITCHER_HEIGHT,
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },

  // ── Audio ──
  audioScroll: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
    // Wide web windows: keep the Listen view a readable column in the middle of the full-width sheet.
    width: '100%',
    maxWidth: PLAYER_CONTENT_MAX,
    alignSelf: 'center',
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    alignSelf: 'center',
  },
  titleBlock: {
    gap: 4,
    marginTop: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  songTitle: {
    color: Palette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  artistName: {
    color: Palette.muted,
    fontSize: 15,
  },
  actionRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6B5440',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  actionPillText: {
    color: Palette.text,
    fontSize: 13,
    fontWeight: '500',
  },
  progressSection: {
    gap: Spacing.two,
    marginTop: Spacing.one,
    marginHorizontal: Spacing.three,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(240,224,209,0.18)',
    borderRadius: 2,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Palette.cyan,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Palette.cyan,
    marginLeft: -8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: Palette.muted,
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Palette.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Hymnal ──
  hymnalContainer: {
    flex: 1,
  },
  hymnalTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  fontBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  fontBtnText: {
    color: Palette.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
    // Wide web windows: a readable column in the middle of the full-width sheet.
    width: '100%',
    maxWidth: PLAYER_CONTENT_MAX,
    alignSelf: 'center',
  },
  lyricBlock: {
    gap: Spacing.two,
  },
  lyricHeading: {
    color: Palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  lyricLines: {
    gap: 4,
  },
  lyricLine: {
    color: Palette.text,
  },
  lyricDim: {
    opacity: 0.45,
  },
  noLyrics: {
    color: Palette.muted,
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  hymnalBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    // Full-width divider between the lyrics and the hymn bar.
    marginHorizontal: -Spacing.four,
    paddingHorizontal: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Palette.line,
    marginTop: Spacing.two,
  },
  hymnalArt: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  hymnalInfo: {
    flex: 1,
    gap: 2,
  },
  hymnalTitle: {
    color: Palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  hymnalArtist: {
    color: Palette.muted,
    fontSize: 12,
  },
  closeBtn: {
    backgroundColor: 'rgba(240,224,209,0.35)',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  closeBtnText: {
    color: Palette.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
