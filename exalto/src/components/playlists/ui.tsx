import { LinearGradient } from 'expo-linear-gradient';
import { Music2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { HymnArt } from '@/components/ui/hymn-art';
import { BrandGradient, Palette, Spacing } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useLocale } from '@/context/locale-context';

/** Figma playlist art: the Exalto blue gradient with a note. */
export const PlaylistGradient = ['#0F6F95', '#04C1FF', '#EDA145'] as const;
/** Figma art for playlists that don't hold the hymn in the add sheet. */
export const PlaylistGradientMuted = ['#3A2C20', '#6E5136'] as const;

export function PlaylistArt({ size, radius = 9, muted }: { size: number; radius?: number; muted?: boolean }) {
  return (
    <LinearGradient
      colors={muted ? PlaylistGradientMuted : PlaylistGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}>
      <Music2 size={Math.round(size * 0.3)} color="#FFFFFF" strokeWidth={1.8} />
    </LinearGradient>
  );
}

/** "Himno 47" when the hymn has a number, else who it's by. */
export function useHymnSubtitle() {
  const { t } = useLocale();
  return (h: Hymn) => (h.label ? t('home.hymnLabel', { label: h.label }) : h.artist);
}

/** Art, title and subtitle: the row used by playlists, the queue and the sheets. */
export function HymnLine({ hymn, size = 40, highlight, onPress, accessibilityLabel }: { hymn: Hymn; size?: number; highlight?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const subtitle = useHymnSubtitle();
  const body = (
    <>
      <HymnArt seed={hymn.id} hymnalId={hymn.hymnalId} size={size} radius={size > 48 ? 12 : 9} />
      <View style={styles.flex}>
        <ThemedText style={[styles.title, highlight && { color: Palette.cyan }]} numberOfLines={1}>
          {hymn.title}
        </ThemedText>
        <ThemedText style={styles.sub} numberOfLines={1}>
          {subtitle(hymn)}
        </ThemedText>
      </View>
    </>
  );
  if (!onPress) return <View style={styles.line}>{body}</View>;
  return (
    <Pressable style={styles.line} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? hymn.title}>
      {body}
    </Pressable>
  );
}

/** Fast enough downward flick (pt/s), or far enough (share of the sheet), to close it. */
const FLICK_VELOCITY = 800;
const CLOSE_SHARE = 0.3;
/** Slide timing. Ease-out both ways, so the sheet visibly moves from the first frame instead of jumping at the end. */
const OPEN_MS = 300;
const CLOSE_MS = 260;

/**
 * Bottom sheet from the Figma "Add to playlist" and "Queue" frames: gradient border and grabber, no dimming.
 * Drag it down to close, like the player. Short sheets drag from anywhere; `tall` ones (which scroll) from the top strip.
 */
export function BottomSheet({ visible, onClose, closeLabel, children, tall }: { visible: boolean; onClose: () => void; closeLabel: string; children: ReactNode; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  // Stays mounted through the closing slide; `visible` only says where it's heading.
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(screenHeight);
  const sheetHeight = useSharedValue(screenHeight);
  /** Just below the bottom edge: the sheet's own height plus the gap under it. Travelling only this far keeps the
   * slide at a speed you can see (moving a whole screen height, a short sheet is gone in a frame or two). */
  const bottomGap = insets.bottom + 10;
  // Callers pass a new onClose on every render; keep one stable function so the Modal and the drag gesture aren't
  // rebuilt (which remounted the sheet mid-slide, so it vanished instead of sliding out).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.value = sheetHeight.value + bottomGap;
      y.value = withTiming(0, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) });
    } else {
      y.value = withTiming(sheetHeight.value + bottomGap, { duration: CLOSE_MS, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const drag = useMemo(
    () =>
      Gesture.Pan()
        // Only a downward drag takes over; taps and sideways moves stay with the content.
        .activeOffsetY(10)
        .failOffsetX([-20, 20])
        .onUpdate((e) => {
          y.value = e.translationY > 0 ? e.translationY : e.translationY / 4;
        })
        .onEnd((e) => {
          if (e.velocityY > FLICK_VELOCITY || y.value > sheetHeight.value * CLOSE_SHARE) {
            // Carry on at about the finger's speed for the rest of the way, then let the parent close it.
            const end = sheetHeight.value + bottomGap;
            const ms = Math.min(CLOSE_MS, Math.max(140, ((end - y.value) / Math.max(e.velocityY, 1200)) * 1000));
            y.value = withTiming(end, { duration: ms, easing: Easing.out(Easing.quad) }, (done) => {
              if (done) runOnJS(close)();
            });
          } else {
            y.value = withSpring(0, { damping: 30, stiffness: 300, velocity: e.velocityY });
          }
        }),
    [close, bottomGap, y, sheetHeight],
  );

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const grabber = (
    <View style={styles.grabZone}>
      <View style={styles.grabber} />
    </View>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        {/* Rises with the keyboard, so a field in the sheet (New playlist) stays in view. */}
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={closeLabel} />
          <Animated.View
            onLayout={(e) => {
              sheetHeight.value = e.nativeEvent.layout.height;
            }}
            style={[styles.sheetFrame, { marginBottom: insets.bottom + 10 }, tall ? { flex: 1, marginTop: insets.top + 50 } : styles.shrink, slide]}>
            <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sheetBorder, tall ? styles.flex : styles.shrink]}>
              {tall ? (
                <LinearGradient colors={[Palette.sheetTop, Palette.sheetBottom]} style={[styles.sheet, styles.flex]}>
                  <GestureDetector gesture={drag}>{grabber}</GestureDetector>
                  {children}
                </LinearGradient>
              ) : (
                <GestureDetector gesture={drag}>
                  <LinearGradient colors={[Palette.sheetTop, Palette.sheetBottom]} style={[styles.sheet, styles.shrink]}>
                    {grabber}
                    {children}
                  </LinearGradient>
                </GestureDetector>
              )}
            </LinearGradient>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

export const listStyles = StyleSheet.create({
  title: { color: Palette.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  sub: { color: Palette.muted, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, backgroundColor: Palette.line, alignSelf: 'stretch' },
  overline: { color: Palette.muted, fontSize: 12, lineHeight: 17, textTransform: 'uppercase', letterSpacing: 0.4 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: listStyles.title,
  sub: listStyles.sub,
  // No dimming: the screen behind stays as it is; tapping it still closes the sheet.
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  shrink: { flexShrink: 1 },
  sheetFrame: { marginHorizontal: 10, maxHeight: '88%' },
  sheetBorder: { borderRadius: 22, padding: 1 },
  sheet: { borderRadius: 21, paddingHorizontal: Spacing.three + 2, paddingTop: 12, paddingBottom: Spacing.three, gap: 12 },
  // Taller than the grabber so it's easy to catch; the negative margins keep the sheet's spacing.
  grabZone: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, marginVertical: -10 },
  grabber: { width: 34, height: 4, borderRadius: 4, backgroundColor: '#8A7E72' },
});
