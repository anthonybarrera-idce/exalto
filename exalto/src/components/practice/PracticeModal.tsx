import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioWaveform, Check, ChevronDown, ChevronLeft, Hand, Mic, MoveHorizontal, Music, Pause, Piano, Play, Shapes } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDecay,
  type FrameInfo,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useSheetEntering } from '@/components/ui/transitions';
import { notePoint, ScoreView, scoreLayout, SCORE_HEIGHT, SPACING, VOICE_COLOR, ZOOM } from '@/components/practice/ScoreView';
import { Palette } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import type { StringKey } from '@/i18n/strings';
import { loadPractice, measureAt, VOICES, type PracticeData, type PracticeNote, type Voice } from '@/lib/practice';
import { PracticePlayer, startNote, type Sound } from '@/lib/practice-audio';

const SHAPES_KEY = 'exalto.practice.shapeNotes';
const SPACING_KEY = 'exalto.practice.spacing';
const TILE_GAP = 8;
/** Narrowest voice tile that still shows its whole label (dot + "Contralto" at 12 pt). */
const TILE_MIN = 92;

const VOICE_LABEL: Record<Voice, StringKey> = { soprano: 'practice.soprano', alto: 'practice.alto', tenor: 'practice.tenor', bass: 'practice.bass' };
const TAP_MS = 250; // shorter presses play the note's written length
const KEY_ES: Record<number, string> = { 0: 'Do', 1: 'Sol', 2: 'Re', 3: 'La', 4: 'Mi', 5: 'Si', [-1]: 'Fa', [-2]: 'Si♭', [-3]: 'Mi♭', [-4]: 'La♭', [-5]: 'Re♭' };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Where the playhead rests while the score follows it (fraction of the view width). */
const FOLLOW_AT = 1 / 3;
/** After the user drags the score while it plays, auto-follow waits this long (or until play / a seek). */
const RESUME_MS = 2000;
/** Time constant for easing the view back onto the playhead (after a seek, a drag, or resuming). */
const EASE_S = 0.35;
/** How fast the UI-thread beat clock is pulled onto the audio clock (per second). */
const DRIFT_RATE = 2.5;

/** Measure geometry in on-screen points, plain arrays so it can be read on the UI thread. */
type Geo = { starts: number[]; beats: number[]; head: number[]; next: number[]; perBeat: number };

/**
 * The x of a beat. `exact` puts it where its note is drawn (it hops over the space after each
 * barline); otherwise the measure is stretched to meet the next one, so the x moves at an even pace
 * (what the view scrolls by).
 */
function beatX(g: Geo, beat: number, exact: boolean) {
  'worklet';
  let i = 0;
  while (i + 1 < g.starts.length && g.starts[i + 1] <= beat) i++;
  const f = beat - g.starts[i];
  if (exact) return g.head[i] + f * g.perBeat;
  return g.head[i] + ((g.next[i] - g.head[i]) * f) / g.beats[i];
}

type Props = { visible: boolean; onClose: () => void; hymnId: string; title: string; source: { url: string; version: number } | 'sample' };

export function PracticeModal({ visible, onClose, ...rest }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* Inside a Modal, Android needs its own gesture root for the score's drag to work. */}
      <GestureHandlerRootView style={{ flex: 1 }}>{visible ? <Practice onClose={onClose} {...rest} /> : null}</GestureHandlerRootView>
    </Modal>
  );
}

/** The practice tool inside the full player (its own tab in the top switch), without a header. */
export function PracticePanel(props: Omit<Props, 'visible' | 'onClose'>) {
  return <Practice {...props} embedded />;
}

function Practice({ onClose, hymnId, title, source, embedded }: Omit<Props, 'visible' | 'onClose'> & { onClose?: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const { t, language } = useLocale();
  const [data, setData] = useState<PracticeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const p =
      source === 'sample'
        ? Promise.resolve(require('@/data/practice-sample.json') as PracticeData)
        : loadPractice(hymnId, source.url, source.version);
    p.then((d) => live && setData(d)).catch((e) => {
      // On web a missing Storage CORS config shows up here as "Failed to fetch" (see loadPractice).
      console.warn('Practice notes failed to load', e);
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [hymnId, source, attempt]);

  return (
    <View style={embedded ? [styles.embedded, { paddingBottom: insets.bottom }] : [styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      {embedded ? null : (
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('player.close')}>
            <ChevronLeft size={24} color={Palette.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>{t('practice.title')}</ThemedText>
        </View>
      )}
      {data ? (
        <Player embedded={embedded} data={data} title={source === 'sample' ? `Sample · ${data.title}` : title} keyName={language === 'es' ? `${KEY_ES[data.key.fifths] ?? ''} mayor` : data.key.name} />
      ) : (
        <View style={styles.center}>
          {failed ? (
            <View style={styles.loadError}>
              <ThemedText style={styles.loadErrorText}>{t('practice.loadError')}</ThemedText>
              <Pressable onPress={() => setAttempt((n) => n + 1)} style={styles.retry} accessibilityRole="button">
                <ThemedText style={styles.retryText}>{t('practice.retry')}</ThemedText>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator color={Palette.cyan} />
          )}
        </View>
      )}
    </View>
  );
}

function Player({ data, title, keyName, embedded }: { data: PracticeData; title: string; keyName: string; embedded?: boolean }) {
  const { t } = useLocale();
  const player = useMemo(() => new PracticePlayer(data), [data]);
  // Space between notes (wider keeps lyric syllables from running together); remembered on this device.
  const [spacing, setSpacingState] = useState(SPACING.default);
  useEffect(() => {
    AsyncStorage.getItem(SPACING_KEY)
      .then((v) => {
        const n = Number(v);
        if (v != null && n >= SPACING.min && n <= SPACING.max) setSpacingState(n);
      })
      .catch(() => {});
  }, []);
  const changeSpacing = (dir: 1 | -1) => {
    const n = Math.min(SPACING.max, Math.max(SPACING.min, spacing + dir * SPACING.step));
    setSpacingState(n);
    AsyncStorage.setItem(SPACING_KEY, String(n)).catch(() => {});
  };
  const layout = useMemo(() => scoreLayout(data, spacing), [data, spacing]);
  const viewW = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [bpm, setBpm] = useState(Math.round(data.tempo));
  const [solo, setSolo] = useState<Voice | null>(null);
  const [sound, setSound] = useState<Sound>('grand');
  const [preparing, setPreparing] = useState(true);
  const [tapMode, setTapMode] = useState(false);
  // Shape notes (do triangle, re half-moon…) or round noteheads; remembered on this device.
  const [shapes, setShapesState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(SHAPES_KEY)
      .then((v) => v === '1' && setShapesState(true))
      .catch(() => {});
  }, []);
  const setShapes = (on: boolean) => {
    setShapesState(on);
    AsyncStorage.setItem(SHAPES_KEY, on ? '1' : '0').catch(() => {});
  };
  const [active, setActive] = useState<{ voice: Voice; note: PracticeNote; holding: boolean; screenX: number } | null>(null);
  // Voice tiles: one row of four when the labels fit ("Contralto" included), else two rows of two.
  const [tilesW, setTilesW] = useState(0);
  const tileCols = tilesW === 0 || tilesW >= 4 * TILE_MIN + 3 * TILE_GAP ? 4 : 2;
  const tileW = tilesW ? (tilesW - (tileCols - 1) * TILE_GAP) / tileCols : undefined;
  const press = useRef<{ release: (min?: number) => void; at: number; dur: number } | null>(null);

  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    player.onEnd = () => setPlaying(false);
  }, [player]);
  useEffect(() => player.setLevels(Object.fromEntries(VOICES.map((v) => [v, !solo || solo === v ? 1 : 0])) as Record<Voice, number>), [player, solo]);
  // Get the chosen sound ready; playing waits for it, and switching mid-song pauses and resumes.
  useEffect(() => {
    let live = true;
    setPreparing(true);
    player
      .setSound(sound)
      .then(() => player.prepare(sound))
      .finally(() => {
        if (!live) return;
        setPreparing(false);
        setPlaying(player.playing);
      });
    return () => {
      live = false;
    };
  }, [player, sound]);
  useEffect(() => player.setTempo(bpm), [player, bpm]);

  // Follow-along, all on the UI thread (no JS work per frame). One shared beat clock drives both the
  // playhead and the scroll, so they can't fight: each frame it advances at the tempo, and the 120 ms
  // sync below nudges it toward the audio clock gently (DRIFT_RATE) instead of snapping.
  // The view keeps the playhead about a third of the way across: at the start the playhead walks up to
  // that point, near the end the view stops at the last measure and the playhead finishes the line.
  // A seek, a resume or the end of a drag eases the view back over (EASE_S) instead of jumping.
  // If the user drags the score while it plays, following pauses until RESUME_MS after they let go
  // (pressing play or tapping a note resumes it at once). Reduce Motion turns pages instead.
  // The score isn't a ScrollView: it's clipped and moved with a transform, and dragged with a pan
  // gesture. Scrolling a ScrollView every frame fires scroll events that let the parent ScrollView take
  // the touch responder, which cancelled every button press while playing.
  const reduceMotion = useReducedMotion();
  const geo = useMemo<Geo>(() => {
    const head = data.measures.map((m) => layout.xOf(m.start));
    return {
      starts: data.measures.map((m) => m.start),
      beats: data.measures.map((m) => m.beats),
      head,
      next: data.measures.map((m, i) => (i + 1 < head.length ? head[i + 1] : head[i] + m.beats * layout.pxPerBeat * ZOOM)),
      perBeat: layout.pxPerBeat * ZOOM,
    };
  }, [data, layout]);
  const totalBeats = data.totalBeats;
  const contentW = layout.width;
  const beatSV = useSharedValue(0);
  const rateSV = useSharedValue(bpm / 60); // beats per second
  const playingSV = useSharedValue(false);
  const driftSV = useSharedValue(0); // audio clock minus beatSV, still to be blended in
  const viewWSV = useSharedValue(0);
  const offsetSV = useSharedValue(0); // how far the score is scrolled (it's moved left by this much)
  const anchoredSV = useSharedValue(false); // following continuously (else ease in from where the view is)
  const errSV = useSharedValue(0); // how far the view still is from where it should be, easing to 0
  const settleSV = useSharedValue(false); // paused, but easing the view onto a seek
  const touchedSV = useSharedValue(false); // the user moved the score since the last frame
  const draggingSV = useSharedValue(false);
  const dragFromSV = useSharedValue(0);
  const holdUntilSV = useSharedValue(0);
  const lastTSV = useSharedValue(-1);

  // Changing the spacing stretches the score; keep the same music in view (eased if playing).
  const prevW = useRef(layout.width);
  useEffect(() => {
    const r = layout.width / prevW.current;
    prevW.current = layout.width;
    if (r === 1) return;
    cancelAnimation(offsetSV);
    offsetSV.value = Math.min(Math.max(0, layout.width - viewW.current), Math.max(0, (offsetSV.value + viewW.current * FOLLOW_AT) * r - viewW.current * FOLLOW_AT));
    anchoredSV.value = false;
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFrame = useCallback(
    (f: FrameInfo) => {
      'worklet';
      const dt = lastTSV.value < 0 ? 0 : Math.min(2, (f.timestamp - lastTSV.value) / 1000);
      lastTSV.value = f.timestamp;
      if (playingSV.value) {
        const d = driftSV.value;
        const c = Math.abs(d) > 1 ? d : d * Math.min(1, dt * DRIFT_RATE); // a big miss (a hiccup) snaps
        driftSV.value = d - c;
        beatSV.value = Math.min(totalBeats, beatSV.value + rateSV.value * dt + c);
      }
      if (touchedSV.value) {
        touchedSV.value = false;
        holdUntilSV.value = f.timestamp + RESUME_MS;
        anchoredSV.value = false;
      }
      const w = viewWSV.value;
      if ((!playingSV.value && !settleSV.value) || draggingSV.value || f.timestamp < holdUntilSV.value || w === 0) {
        anchoredSV.value = false;
        return;
      }
      const max = Math.max(0, contentW - w);
      if (reduceMotion) {
        // Page turns, no motion: jump when the playhead nears the right edge or is off screen.
        const x = beatX(geo, beatSV.value, true);
        const s = offsetSV.value;
        if (x - s > w * 0.7 || x < s) offsetSV.value = Math.min(max, Math.max(0, x - w * 0.2));
        settleSV.value = false;
        return;
      }
      const target = Math.min(max, Math.max(0, beatX(geo, beatSV.value, false) - w * FOLLOW_AT));
      if (!anchoredSV.value) {
        cancelAnimation(offsetSV); // a fling still coasting
        errSV.value = offsetSV.value - target;
        anchoredSV.value = true;
      }
      // Capped step: after a long frame (a re-render on web) the glide still plays out instead of jumping.
      errSV.value *= Math.exp(-Math.min(dt, 0.05) / EASE_S);
      if (Math.abs(errSV.value) < 0.2) errSV.value = 0;
      offsetSV.value = target + errSV.value;
      if (!playingSV.value && errSV.value === 0) settleSV.value = false;
    },
    [geo, contentW, totalBeats, reduceMotion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useFrameCallback(onFrame);

  // Dragging the score by hand (a fling coasts and stops at the ends). Taps fall through to the notes.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-12, 12])
        .onStart(() => {
          cancelAnimation(offsetSV);
          draggingSV.value = true;
          dragFromSV.value = offsetSV.value;
        })
        .onUpdate((e) => {
          const max = Math.max(0, contentW - viewWSV.value);
          offsetSV.value = Math.min(max, Math.max(0, dragFromSV.value - e.translationX));
        })
        .onFinalize((e) => {
          if (!draggingSV.value) return;
          draggingSV.value = false;
          touchedSV.value = true;
          offsetSV.value = withDecay({ velocity: -e.velocityX, clamp: [0, Math.max(0, contentW - viewWSV.value)] });
        }),
    [contentW], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Web: a trackpad or shift + mouse wheel scrolls the score sideways, as the ScrollView did.
  const clip = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = clip.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx || Math.abs(e.deltaY) > Math.abs(dx) * (e.shiftKey ? Infinity : 1)) return;
      e.preventDefault();
      cancelAnimation(offsetSV);
      offsetSV.value = Math.min(Math.max(0, contentW - viewWSV.value), Math.max(0, offsetSV.value + dx));
      touchedSV.value = true;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [contentW]); // eslint-disable-line react-hooks/exhaustive-deps
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -offsetSV.value }] }));
  const playheadStyle = useAnimatedStyle(() => ({ transform: [{ translateX: beatX(geo, beatSV.value, true) }] }));

  /** Follow again now (play pressed, a note tapped), easing over from wherever the view is. */
  const resumeFollow = () => {
    cancelAnimation(offsetSV);
    holdUntilSV.value = 0;
    touchedSV.value = false;
    draggingSV.value = false;
    anchoredSV.value = false;
  };

  useEffect(() => {
    rateSV.value = bpm / 60;
  }, [bpm, rateSV]);
  // Re-sync to the audio clock and update the highlighted notes every 120 ms.
  useEffect(() => {
    playingSV.value = playing;
    beatSV.value = player.beat();
    driftSV.value = 0;
    if (!playing) return;
    const sync = () => {
      const b = player.beat();
      setBeat(b);
      // Measured here, against the beat clock as it is right now (a read from JS is synchronous), so
      // the error isn't biased by a frame of delay; the frame callback then blends it in.
      driftSV.value = b - beatSV.value;
    };
    sync();
    const id = setInterval(sync, 120);
    return () => clearInterval(id);
  }, [playing, player]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) beatSV.value = beat;
  }, [beat, playing, beatSV]);

  const toggle = () => {
    if (preparing) return;
    if (player.playing) player.pause();
    else {
      resumeFollow();
      player.play(beat);
    }
    setPlaying(player.playing);
    setBeat(player.beat());
  };
  const seekTo = (b: number) => {
    if (!Number.isFinite(b)) return;
    player.seek(b);
    setBeat(b);
    beatSV.value = b;
    driftSV.value = 0;
    resumeFollow();
    if (!player.playing) settleSV.value = true;
  };

  const onNoteIn = useCallback(
    (voice: Voice, n: PracticeNote) => {
      if (!tapMode) {
        seekTo(n.start);
        return;
      }
      if (n.midi == null) return;
      press.current?.release();
      press.current = { ...startNote(n.midi, sound), at: Date.now(), dur: (n.dur * 60) / bpm };
      setActive({ voice, note: n, holding: true, screenX: notePoint(data, layout, voice, n).x - offsetSV.value });
    },
    [tapMode, sound, bpm], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const onNoteOut = useCallback(() => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    // A quick tap plays the written length; a hold stops when the finger lifts.
    p.release(Date.now() - p.at < TAP_MS ? p.dur : 0);
    setActive((a) => (a ? { ...a, holding: false } : a));
  }, []);

  const faded = useMemo(() => new Set(solo ? VOICES.filter((v) => v !== solo) : []), [solo]);
  // While playing, the notes under the playhead light up in their voice colour. `beat` comes from the
  // 120 ms sync above; the ids are joined into a string so the score re-renders only when a note starts or ends.
  const soundingKey = useMemo(() => {
    if (!playing) return '';
    const ids: string[] = [];
    for (const v of VOICES) {
      if (faded.has(v)) continue;
      for (const n of data.voices[v].notes) {
        if (n.start > beat + 1e-6) break;
        if (!n.rest && beat < n.start + n.dur - 1e-6) ids.push(n.id);
      }
    }
    return ids.join(',');
  }, [playing, beat, data, faded]);
  const sounding = useMemo(() => new Set(soundingKey ? soundingKey.split(',') : []), [soundingKey]);
  const total = (data.totalBeats * 60) / bpm;

  return (
    <ScrollView contentContainerStyle={[styles.body, embedded && styles.bodyEmbedded]} showsVerticalScrollIndicator={false}>
      <View>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.muted}>
          {keyName} · {data.time.beats}/{data.time.beatType} · {t('practice.measures', { count: String(data.measureCount) })}
        </ThemedText>
      </View>

      <View style={styles.paper} onLayout={(e) => (viewW.current = viewWSV.value = e.nativeEvent.layout.width)}>
        {/* The tapped note's name sits in its own lane above the staff, so it never covers the note or the finger. */}
        <View style={styles.calloutLane} pointerEvents="none">
          {/* The pointer sits behind the bubble, so only its tip shows below it. */}
          {active ? <View style={[styles.caret, { left: Math.min(Math.max(10, active.screenX - 6), viewW.current - 16) }]} /> : null}
          {active ? (
            <View style={[styles.callout, { left: Math.min(Math.max(4, active.screenX - 80), Math.max(4, viewW.current - 164)) }, active.holding && styles.calloutHolding]}>
              <ThemedText style={styles.calloutTitle} numberOfLines={1}>
                <ThemedText style={[styles.calloutTitle, { color: VOICE_COLOR[active.voice] }]}>● </ThemedText>
                {active.note.name} · {t(VOICE_LABEL[active.voice])}
              </ThemedText>
              <ThemedText style={styles.calloutSub} numberOfLines={1}>{active.holding ? t('practice.sounding') : t('practice.tapHint')}</ThemedText>
            </View>
          ) : null}
        </View>
        <GestureDetector gesture={pan}>
          <View ref={clip} style={styles.scoreClip}>
            <Reanimated.View style={[{ width: layout.width, height: SCORE_HEIGHT }, scoreStyle]}>
              <ScoreView data={data} layout={layout} faded={faded} activeId={active?.note.id ?? null} onNoteIn={onNoteIn} onNoteOut={onNoteOut} shapes={shapes} sounding={sounding} />
              <Reanimated.View pointerEvents="none" style={[styles.playhead, { left: -1, opacity: tapMode && !playing ? 0.3 : 1 }, playheadStyle]} />
            </Reanimated.View>
          </View>
        </GestureDetector>
        <ThemedText style={styles.paperHint}>{tapMode ? t('practice.holdHint') : t('practice.scoreHint')}</ThemedText>
      </View>

      <View style={styles.card}>
        {/* On narrow phones the tempo pill moves to its own line rather than squeezing the time. */}
        <View style={[styles.row, styles.wrap]}>
          <Pressable onPress={toggle} style={styles.play} accessibilityRole="button" accessibilityLabel={t(playing ? 'player.pause' : 'player.play')}>
            {preparing ? <ActivityIndicator color="#04131B" /> : playing ? <Pause size={20} color="#04131B" fill="#04131B" /> : <Play size={20} color="#04131B" fill="#04131B" />}
          </Pressable>
          <View style={styles.timeBox}>
            <ThemedText style={styles.time} numberOfLines={1}>
              {fmt((beat * 60) / bpm)} / {fmt(total)}
            </ThemedText>
            <ThemedText style={styles.mutedSmall} numberOfLines={1}>{t('practice.measureOf', { n: String(measureAt(data, beat)), total: String(data.measureCount) })}</ThemedText>
          </View>
          <View style={styles.tempo}>
            <Pressable onPress={() => setBpm((b) => Math.max(30, b - 5))} hitSlop={8} accessibilityLabel={t('practice.slower')}>
              <ThemedText style={styles.tempoBtn}>−</ThemedText>
            </Pressable>
            <ThemedText style={styles.tempoVal}>{bpm} BPM</ThemedText>
            <Pressable onPress={() => setBpm((b) => Math.min(220, b + 5))} hitSlop={8} accessibilityLabel={t('practice.faster')}>
              <ThemedText style={styles.tempoBtn}>+</ThemedText>
            </Pressable>
          </View>
        </View>
        <Pressable
          style={styles.seek}
          onPress={(e) => {
            const w = viewW.current - 24;
            seekTo(Math.max(0, Math.min(1, e.nativeEvent.locationX / w)) * data.totalBeats);
          }}>
          <View style={styles.track} />
          <View style={[styles.trackFill, { width: `${(beat / data.totalBeats) * 100}%` }]} />
        </Pressable>
      </View>

      <View style={styles.rowBetween}>
        <ThemedText style={styles.label}>{t('practice.voices')}</ThemedText>
        <Chip on={!solo} onPress={() => setSolo(null)} label={t('practice.allVoices')} />
      </View>
      <View style={styles.tiles} onLayout={(e) => setTilesW(e.nativeEvent.layout.width)}>
        {VOICES.map((v) => (
          <Pressable
            key={v}
            onPress={() => setSolo(solo === v ? null : v)}
            style={[styles.tile, tileW ? { width: tileW } : { flex: 1 }, solo === v && { borderColor: VOICE_COLOR[v] }, solo && solo !== v && { opacity: 0.45 }]}>
            <View style={[styles.dot, { backgroundColor: VOICE_COLOR[v] }]} />
            <ThemedText style={styles.tileText} numberOfLines={1}>
              {t(VOICE_LABEL[v])}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Wraps onto a second line on narrow phones (iPhone SE) instead of running off the edge. */}
      <View style={styles.chipRow}>
        <SoundMenu sound={sound} onChange={setSound} />
        <Pressable onPress={() => setTapMode((m) => !m)} style={[styles.tapChip, tapMode && styles.tapChipOn]}>
          <Hand size={14} color={tapMode ? '#04131B' : Palette.text} />
          <ThemedText style={[styles.chipText, tapMode && { color: '#04131B' }]}>{t('practice.tapNote')}</ThemedText>
        </Pressable>
        <View style={styles.spacing}>
          <Pressable onPress={() => changeSpacing(-1)} disabled={spacing <= SPACING.min} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('practice.spacingLess')}>
            <ThemedText style={[styles.tempoBtn, spacing <= SPACING.min && styles.off]}>−</ThemedText>
          </Pressable>
          <MoveHorizontal size={14} color={Palette.text} />
          <ThemedText style={styles.chipText}>{t('practice.spacing')}</ThemedText>
          <Pressable onPress={() => changeSpacing(1)} disabled={spacing >= SPACING.max} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('practice.spacingMore')}>
            <ThemedText style={[styles.tempoBtn, spacing >= SPACING.max && styles.off]}>+</ThemedText>
          </Pressable>
        </View>
        <Pressable onPress={() => setShapes(!shapes)} accessibilityRole="switch" accessibilityState={{ checked: shapes }} style={[styles.tapChip, shapes && styles.tapChipOn]}>
          <Shapes size={14} color={shapes ? '#04131B' : Palette.text} />
          <ThemedText style={[styles.chipText, shapes && { color: '#04131B' }]}>{t('practice.shapeNotes')}</ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Chip({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && { backgroundColor: Palette.cyan }]}>
      <ThemedText style={[styles.chipText, on && { color: '#04131B' }]}>{label}</ThemedText>
    </Pressable>
  );
}

const SOUNDS: { id: Sound; label: StringKey; hint: StringKey; Icon: typeof Piano }[] = [
  { id: 'grand', label: 'practice.grand', hint: 'practice.grandHint', Icon: Piano },
  { id: 'piano', label: 'practice.piano', hint: 'practice.pianoHint', Icon: Music },
  { id: 'choir', label: 'practice.choir', hint: 'practice.choirHint', Icon: Mic },
  { id: 'tone', label: 'practice.tones', hint: 'practice.tonesHint', Icon: AudioWaveform },
];

/** Sound picker: a button showing the current sound that opens a small menu of all of them. */
function SoundMenu({ sound, onChange }: { sound: Sound; onChange: (s: Sound) => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const sheetEntering = useSheetEntering();
  const current = SOUNDS.find((x) => x.id === sound) ?? SOUNDS[0];
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.menuBtn}
        accessibilityRole="button"
        accessibilityLabel={`${t('practice.sound')}: ${t(current.label)}`}>
        <current.Icon size={14} color={Palette.text} />
        <ThemedText style={styles.chipText}>{t(current.label)}</ThemedText>
        <ChevronDown size={14} color={Palette.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* The backdrop's close target sits behind the menu as a sibling, so menu items aren't nested in it. */}
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('player.close')} />
          <Reanimated.View entering={sheetEntering} style={styles.menu}>
            <ThemedText style={styles.menuTitle}>{t('practice.sound')}</ThemedText>
            {SOUNDS.map(({ id, label, hint, Icon }) => (
              <Pressable
                key={id}
                onPress={() => {
                  onChange(id);
                  setOpen(false);
                }}
                style={[styles.menuItem, id === sound && styles.menuItemOn]}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: id === sound }}>
                <Icon size={18} color={id === sound ? Palette.cyan : Palette.text} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.menuItemText}>{t(label)}</ThemedText>
                  <ThemedText style={styles.mutedSmall}>{t(hint)}</ThemedText>
                </View>
                {id === sound ? <Check size={18} color={Palette.cyan} /> : null}
              </Pressable>
            ))}
            <ThemedText style={styles.menuCredit}>{t('practice.pianoCredit')}</ThemedText>
          </Reanimated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  // Inside the full player: the sheet already supplies the background and side margins.
  embedded: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 48 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  bodyEmbedded: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  muted: { color: Palette.muted, fontSize: 13 },
  loadError: { alignItems: 'center', gap: 14, maxWidth: 320 },
  loadErrorText: { color: Palette.muted, fontSize: 14, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: Palette.cyan },
  retryText: { color: Palette.cyan, fontSize: 14, fontWeight: '600' },
  mutedSmall: { color: Palette.muted, fontSize: 12 },
  paper: { backgroundColor: '#F3EDE4', borderRadius: 12, overflow: 'hidden', paddingBottom: 8 },
  paperHint: { color: '#2A2016', opacity: 0.6, fontSize: 11, paddingHorizontal: 12 },
  scoreClip: { height: SCORE_HEIGHT, overflow: 'hidden' },
  playhead: { position: 'absolute', top: 30, width: 2, height: SCORE_HEIGHT - 60, backgroundColor: Palette.cyan, borderRadius: 1 },
  calloutLane: { height: 58, marginBottom: -8 },
  callout: { position: 'absolute', top: 6, height: 44, justifyContent: 'center', width: 160, backgroundColor: Palette.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  caret: { position: 'absolute', top: 44, width: 12, height: 12, backgroundColor: Palette.bg, transform: [{ rotate: '45deg' }] },
  calloutHolding: { borderWidth: 1.5, borderColor: Palette.cyan },
  calloutTitle: { fontSize: 14, fontWeight: '700' },
  calloutSub: { fontSize: 11, color: Palette.muted },
  card: { backgroundColor: Palette.surface, borderRadius: 16, padding: 12, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  play: { width: 48, height: 48, borderRadius: 24, backgroundColor: Palette.cyan, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 16, fontWeight: '700' },
  wrap: { flexWrap: 'wrap' },
  timeBox: { flex: 1, minWidth: 92 },
  tempo: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Palette.pill, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tempoBtn: { fontSize: 18, fontWeight: '700' },
  tempoVal: { fontSize: 13, fontWeight: '700' },
  // Same height as the chips beside it.
  spacing: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: Palette.line, paddingHorizontal: 10, paddingVertical: 4 },
  off: { opacity: 0.3 },
  seek: { height: 20, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.pill },
  trackFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: Palette.cyan },
  label: { color: Palette.amber, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Palette.surface2, borderRadius: 12, borderWidth: 1.5, borderColor: Palette.line, paddingHorizontal: 8, paddingVertical: 10 },
  tileText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chip: { borderRadius: 999, backgroundColor: Palette.pill, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  // Same height as the chips beside it (they have a 1 pt border).
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Palette.pill, borderRadius: 999, borderWidth: 1, borderColor: Palette.pill, paddingHorizontal: 12, paddingVertical: 8 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', padding: 16, paddingBottom: 40 },
  menu: { backgroundColor: Palette.surface, borderRadius: 18, padding: 8, gap: 2 },
  menuTitle: { color: Palette.amber, fontSize: 12, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  menuItemOn: { backgroundColor: Palette.surface2 },
  menuItemText: { fontSize: 15, fontWeight: '600' },
  menuCredit: { color: Palette.muted, fontSize: 10, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  tapChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: Palette.line, paddingHorizontal: 10, paddingVertical: 8 },
  tapChipOn: { backgroundColor: Palette.cyan, borderColor: Palette.cyan },
});
