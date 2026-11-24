import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp, Cast, Download, FileText, Heart, ListMusic, MoreVertical, Music, Pause, Play, Repeat, Repeat1, Share2, Shuffle, SkipBack, SkipForward, ThumbsUp, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { useAudio } from '@/hooks/use-audio';
import { useFavorites } from '@/context/favorites-context';
import { useLocale, useSectionLabel } from '@/context/locale-context';

/** Like state for the hymn that's open, backed by on-device favorites. */
function useLike(id: string | undefined) {
  const { isFavorite, toggle } = useFavorites();
  return { isLiked: id ? isFavorite(id) : false, toggleLike: () => id && toggle(id) };
}
import { useViewMode } from '@/context/view-mode-context';
import { LyricSection } from '@/context/audio-context';
import { AccentColor, BrandGradient, Palette, Spacing } from '@/constants/theme';
import { HymnArt } from '@/components/ui/hymn-art';
import { PracticeModal } from '@/components/practice/PracticeModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 68; // SCREEN_WIDTH - H_INSET*2 - paddingHorizontal*2

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
}

// ─── Audio mode ─────────────────────────────────────────────────────────────

function AudioView({ onClose }: FullPlayerProps) {
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
  } = useAudio();
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
    <ScrollView
      showsVerticalScrollIndicator={false}
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

      {/* Action pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionRow}>
        <ActionPill Icon={ThumbsUp} label={t('player.like')} onPress={toggleLike} />
        <ActionPill Icon={Share2} label={t('player.share')} />
        <ActionPill Icon={Download} label={t('player.download')} />
        <ActionPill Icon={ListMusic} label={t('player.queue')} />
      </ScrollView>

      {/* Progress */}
      <View style={styles.progressSection}>
        <Pressable
          style={styles.progressTrack}
          onPress={(e) => {
            const ratio = Math.min(
              Math.max(e.nativeEvent.locationX / (SCREEN_WIDTH - 68), 0),
              1,
            );
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
    </ScrollView>
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
  const { isLiked, toggleLike } = useLike(currentHymn?.id);
  const { t } = useLocale();
  const [fontSize, setFontSize] = useState(15);
  const [practicing, setPracticing] = useState(false);

  if (!currentHymn) return null;
  // Dev builds can try the practice screen with a bundled sample before any hymn has practice notes uploaded.
  const practiceSource = currentHymn.practice ?? (__DEV__ ? ('sample' as const) : null);

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
        <Pressable hitSlop={8}>
          <FileText size={24} color={Palette.text} strokeWidth={1.6} />
        </Pressable>
      </View>

      {practiceSource ? (
        <Pressable style={styles.practiceBtn} onPress={() => setPracticing(true)} accessibilityRole="button">
          <View style={styles.practiceIcon}>
            <Music size={16} color="#04131B" strokeWidth={2.2} />
          </View>
          <ThemedText style={styles.practiceText}>{t('practice.open')}</ThemedText>
        </Pressable>
      ) : null}
      {practiceSource ? (
        <PracticeModal
          visible={practicing}
          onClose={() => setPracticing(false)}
          hymnId={currentHymn.id}
          title={currentHymn.title}
          source={practiceSource}
        />
      ) : null}

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
        <HymnArt seed={currentHymn.id} size={52} radius={10} />
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

export function FullPlayer({ onClose, dragGesture }: RootProps) {
  const { viewMode } = useViewMode();

  const header = (
    <View collapsable={false}>
      {/* Drag handle */}
      <View style={styles.dragZone}>
        <View style={styles.dragHandle} />
      </View>

      {/* Top bar: mode switcher + right icons */}
      <View style={styles.topBar}>
        <ModeSwitcher variant="inline" />

        <View style={{ flex: 1 }} />

        {viewMode === 'audio' ? (
          <>
            <Pressable hitSlop={8}>
              <Cast size={22} color={Palette.text} strokeWidth={1.6} />
            </Pressable>
            <Pressable hitSlop={8}>
              <MoreVertical size={22} color={Palette.text} />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {dragGesture ? <GestureDetector gesture={dragGesture}>{header}</GestureDetector> : header}

      {/* Content */}
      {viewMode === 'audio' ? (
        <AudioView onClose={onClose} />
      ) : (
        <HymnalView onClose={onClose} />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },

  // ── Audio ──
  audioScroll: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
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
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.line,
    backgroundColor: Palette.surface2,
  },
  practiceIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Palette.cyan, alignItems: 'center', justifyContent: 'center' },
  practiceText: { fontSize: 14, fontWeight: '700' },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
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
