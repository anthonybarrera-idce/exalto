import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioWaveform, Check, ChevronDown, ChevronLeft, Hand, Mic, Music, Pause, Piano, Play, Shapes } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { notePoint, ScoreView, scoreLayout, SCORE_HEIGHT, VOICE_COLOR } from '@/components/practice/ScoreView';
import { Palette } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import type { StringKey } from '@/i18n/strings';
import { loadPractice, measureAt, VOICES, type PracticeData, type PracticeNote, type Voice } from '@/lib/practice';
import { PracticePlayer, startNote, type Sound } from '@/lib/practice-audio';

const SHAPES_KEY = 'exalto.practice.shapeNotes';

const VOICE_LABEL: Record<Voice, StringKey> = { soprano: 'practice.soprano', alto: 'practice.alto', tenor: 'practice.tenor', bass: 'practice.bass' };
const TAP_MS = 250; // shorter presses play the note's written length
const KEY_ES: Record<number, string> = { 0: 'Do', 1: 'Sol', 2: 'Re', 3: 'La', 4: 'Mi', 5: 'Si', [-1]: 'Fa', [-2]: 'Si♭', [-3]: 'Mi♭', [-4]: 'La♭', [-5]: 'Re♭' };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Props = { visible: boolean; onClose: () => void; hymnId: string; title: string; source: { url: string; version: number } | 'sample' };

export function PracticeModal({ visible, onClose, ...rest }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible ? <Practice onClose={onClose} {...rest} /> : null}
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const p =
      source === 'sample'
        ? Promise.resolve(require('@/data/practice-sample.json') as PracticeData)
        : loadPractice(hymnId, source.url, source.version);
    p.then((d) => live && setData(d)).catch((e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [hymnId, source]);

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
        <Player embedded={embedded} data={data} title={title} keyName={language === 'es' ? `${KEY_ES[data.key.fifths] ?? ''} mayor` : data.key.name} />
      ) : (
        <View style={styles.center}>
          {error ? <ThemedText style={styles.muted}>{t('practice.loadError', { error })}</ThemedText> : <ActivityIndicator color={Palette.cyan} />}
        </View>
      )}
    </View>
  );
}

function Player({ data, title, keyName, embedded }: { data: PracticeData; title: string; keyName: string; embedded?: boolean }) {
  const { t } = useLocale();
  const player = useMemo(() => new PracticePlayer(data), [data]);
  const layout = useMemo(() => scoreLayout(data), [data]);
  const scroll = useRef<ScrollView>(null);
  const viewW = useRef(0);
  const scrollX = useRef(0);
  // The playhead moves every frame without re-rendering the score (smooth, no flicker).
  const playX = useRef(new Animated.Value(layout.xOf(0))).current;
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

  // While playing, the playhead glides across each measure on the native side (no JS work per frame),
  // re-synced to the audio clock at every measure. The score scrolls a page at a time, only when the
  // playhead nears the right edge, so the JS thread stays free for the buttons.
  useEffect(() => {
    if (!playing) return;
    let measure = -1;
    let anim: Animated.CompositeAnimation | null = null;
    const sync = () => {
      const b = player.beat();
      setBeat(b);
      const i = measureAt(data, b) - 1;
      if (i !== measure) {
        measure = i;
        const m = data.measures[i];
        const end = m.start + m.beats;
        anim?.stop();
        playX.setValue(layout.xOf(b));
        anim = Animated.timing(playX, {
          toValue: layout.xOf(end) - 2,
          duration: Math.max(0, ((end - b) * 60 * 1000) / player.bpm),
          easing: Easing.linear,
          useNativeDriver: true,
        });
        anim.start();
        const x = layout.xOf(b);
        const w = viewW.current;
        if (x - scrollX.current > w * 0.7 || x < scrollX.current) scroll.current?.scrollTo({ x: Math.max(0, x - w * 0.2), animated: true });
      }
    };
    sync();
    const id = setInterval(sync, 120);
    return () => {
      clearInterval(id);
      anim?.stop();
    };
  }, [playing, player, layout, playX, data, bpm]);
  useEffect(() => {
    if (!playing) playX.setValue(layout.xOf(beat));
  }, [beat, playing, layout, playX]);

  const toggle = () => {
    if (preparing) return;
    if (player.playing) player.pause();
    else player.play(beat);
    setPlaying(player.playing);
    setBeat(player.beat());
  };
  const seekTo = (b: number) => {
    player.seek(b);
    setBeat(b);
    scroll.current?.scrollTo({ x: Math.max(0, layout.xOf(b) - viewW.current / 3), animated: true });
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
      setActive({ voice, note: n, holding: true, screenX: notePoint(data, layout, voice, n).x - scrollX.current });
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
  const total = (data.totalBeats * 60) / bpm;

  return (
    <ScrollView contentContainerStyle={[styles.body, embedded && styles.bodyEmbedded]} showsVerticalScrollIndicator={false}>
      <View>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.muted}>
          {keyName} · {data.time.beats}/{data.time.beatType} · {t('practice.measures', { count: String(data.measureCount) })}
        </ThemedText>
      </View>

      <View style={styles.paper} onLayout={(e) => (viewW.current = e.nativeEvent.layout.width)}>
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
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => (scrollX.current = e.nativeEvent.contentOffset.x)}>
          <View style={{ width: layout.width, height: SCORE_HEIGHT }}>
            <ScoreView data={data} layout={layout} faded={faded} activeId={active?.note.id ?? null} onNoteIn={onNoteIn} onNoteOut={onNoteOut} shapes={shapes} />
            <Animated.View
              pointerEvents="none"
              style={[styles.playhead, { left: -1, transform: [{ translateX: playX }], opacity: tapMode && !playing ? 0.3 : 1 }]}
            />
          </View>
        </ScrollView>
        <ThemedText style={styles.paperHint}>{tapMode ? t('practice.holdHint') : t('practice.scoreHint')}</ThemedText>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Pressable onPress={toggle} style={styles.play} accessibilityRole="button" accessibilityLabel={t(playing ? 'player.pause' : 'player.play')}>
            {preparing ? <ActivityIndicator color="#04131B" /> : playing ? <Pause size={20} color="#04131B" fill="#04131B" /> : <Play size={20} color="#04131B" fill="#04131B" />}
          </Pressable>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.time}>
              {fmt((beat * 60) / bpm)} / {fmt(total)}
            </ThemedText>
            <ThemedText style={styles.mutedSmall}>{t('practice.measureOf', { n: String(measureAt(data, beat)), total: String(data.measureCount) })}</ThemedText>
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
      <View style={styles.tiles}>
        {VOICES.map((v) => (
          <Pressable key={v} onPress={() => setSolo(solo === v ? null : v)} style={[styles.tile, solo === v && { borderColor: VOICE_COLOR[v] }, solo && solo !== v && { opacity: 0.45 }]}>
            <View style={[styles.dot, { backgroundColor: VOICE_COLOR[v] }]} />
            <ThemedText style={styles.tileText} numberOfLines={1}>
              {t(VOICE_LABEL[v])}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <SoundMenu sound={sound} onChange={setSound} />
        <Pressable onPress={() => setTapMode((m) => !m)} style={[styles.tapChip, tapMode && styles.tapChipOn]}>
          <Hand size={14} color={tapMode ? '#04131B' : Palette.text} />
          <ThemedText style={[styles.chipText, tapMode && { color: '#04131B' }]}>{t('practice.tapNote')}</ThemedText>
        </Pressable>
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
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
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
          </View>
        </Pressable>
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
  mutedSmall: { color: Palette.muted, fontSize: 12 },
  paper: { backgroundColor: '#F3EDE4', borderRadius: 12, overflow: 'hidden', paddingBottom: 8 },
  paperHint: { color: '#2A2016', opacity: 0.6, fontSize: 11, paddingHorizontal: 12 },
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
  tempo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Palette.pill, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tempoBtn: { fontSize: 18, fontWeight: '700' },
  tempoVal: { fontSize: 13, fontWeight: '700' },
  seek: { height: 20, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.pill },
  trackFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: Palette.cyan },
  label: { color: Palette.amber, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Palette.surface2, borderRadius: 12, borderWidth: 1.5, borderColor: Palette.line, paddingHorizontal: 8, paddingVertical: 10 },
  tileText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chip: { borderRadius: 999, backgroundColor: Palette.pill, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Palette.pill, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
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
