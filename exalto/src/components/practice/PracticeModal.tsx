import { ChevronLeft, Hand, Pause, Piano, Play, AudioWaveform } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { notePoint, ScoreView, scoreLayout, SCORE_HEIGHT, VOICE_COLOR } from '@/components/practice/ScoreView';
import { Palette } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import type { StringKey } from '@/i18n/strings';
import { loadPractice, measureAt, VOICES, type PracticeData, type PracticeNote, type Voice } from '@/lib/practice';
import { PracticePlayer, startNote, type Sound } from '@/lib/practice-audio';

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

function Practice({ onClose, hymnId, title, source }: Omit<Props, 'visible'>) {
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
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('player.close')}>
          <ChevronLeft size={24} color={Palette.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{t('practice.title')}</ThemedText>
      </View>
      {data ? (
        <Player data={data} title={title} keyName={language === 'es' ? `${KEY_ES[data.key.fifths] ?? ''} mayor` : data.key.name} />
      ) : (
        <View style={styles.center}>
          {error ? <ThemedText style={styles.muted}>{t('practice.loadError', { error })}</ThemedText> : <ActivityIndicator color={Palette.cyan} />}
        </View>
      )}
    </View>
  );
}

function Player({ data, title, keyName }: { data: PracticeData; title: string; keyName: string }) {
  const { t } = useLocale();
  const player = useMemo(() => new PracticePlayer(data), [data]);
  const layout = useMemo(() => scoreLayout(data), [data]);
  const scroll = useRef<ScrollView>(null);
  const viewW = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [bpm, setBpm] = useState(Math.round(data.tempo));
  const [solo, setSolo] = useState<Voice | null>(null);
  const [sound, setSound] = useState<Sound>('piano');
  const [tapMode, setTapMode] = useState(false);
  const [active, setActive] = useState<{ voice: Voice; note: PracticeNote; holding: boolean } | null>(null);
  const press = useRef<{ release: (min?: number) => void; at: number; dur: number } | null>(null);

  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    player.onEnd = () => setPlaying(false);
  }, [player]);
  useEffect(() => player.setLevels(Object.fromEntries(VOICES.map((v) => [v, !solo || solo === v ? 1 : 0])) as Record<Voice, number>), [player, solo]);
  useEffect(() => player.setSound(sound), [player, sound]);
  useEffect(() => player.setTempo(bpm), [player, bpm]);

  // Follow the playhead and keep it about a third of the way across the screen.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const b = player.beat();
      setBeat(b);
      scroll.current?.scrollTo({ x: Math.max(0, layout.xOf(b) - viewW.current / 3), animated: false });
    }, 50);
    return () => clearInterval(id);
  }, [playing, player, layout]);

  const toggle = () => {
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
      setActive({ voice, note: n, holding: true });
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
  const playheadX = layout.xOf(beat);
  const callout = active ? notePoint(data, layout, active.voice, active.note) : null;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={styles.muted}>
          {keyName} · {data.time.beats}/{data.time.beatType} · {t('practice.measures', { count: String(data.measureCount) })}
        </ThemedText>
      </View>

      <View style={styles.paper} onLayout={(e) => (viewW.current = e.nativeEvent.layout.width)}>
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: layout.width, height: SCORE_HEIGHT }}>
            <ScoreView data={data} layout={layout} faded={faded} activeId={active?.note.id ?? null} onNoteIn={onNoteIn} onNoteOut={onNoteOut} />
            <View pointerEvents="none" style={[styles.playhead, { left: playheadX - 1, opacity: tapMode && !playing ? 0.3 : 1 }]} />
            {callout && active ? (
              <View pointerEvents="none" style={[styles.callout, { left: Math.max(4, callout.x - 80), top: Math.max(2, callout.y - 70) }, active.holding && styles.calloutHolding]}>
                <ThemedText style={styles.calloutTitle}>
                  {active.note.name} · {t(VOICE_LABEL[active.voice])}
                </ThemedText>
                <ThemedText style={styles.calloutSub}>{active.holding ? t('practice.sounding') : t('practice.tapHint')}</ThemedText>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <ThemedText style={styles.paperHint}>{tapMode ? t('practice.holdHint') : t('practice.scoreHint')}</ThemedText>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Pressable onPress={toggle} style={styles.play} accessibilityRole="button" accessibilityLabel={t(playing ? 'player.pause' : 'player.play')}>
            {playing ? <Pause size={20} color="#04131B" fill="#04131B" /> : <Play size={20} color="#04131B" fill="#04131B" />}
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
        <View style={styles.segment}>
          <Seg on={sound === 'piano'} onPress={() => setSound('piano')} Icon={Piano} label={t('practice.piano')} />
          <Seg on={sound === 'tone'} onPress={() => setSound('tone')} Icon={AudioWaveform} label={t('practice.tones')} />
        </View>
        <Pressable onPress={() => setTapMode((m) => !m)} style={[styles.tapChip, tapMode && styles.tapChipOn]}>
          <Hand size={14} color={tapMode ? '#04131B' : Palette.text} />
          <ThemedText style={[styles.chipText, tapMode && { color: '#04131B' }]}>{t('practice.tapNote')}</ThemedText>
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

function Seg({ on, onPress, Icon, label }: { on: boolean; onPress: () => void; Icon: typeof Piano; label: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, on && { backgroundColor: Palette.amber }]}>
      <Icon size={14} color={on ? Palette.bg : Palette.text} />
      <ThemedText style={[styles.chipText, on && { color: Palette.bg }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 48 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  muted: { color: Palette.muted, fontSize: 13 },
  mutedSmall: { color: Palette.muted, fontSize: 12 },
  paper: { backgroundColor: '#F3EDE4', borderRadius: 12, overflow: 'hidden', paddingBottom: 8 },
  paperHint: { color: '#2A2016', opacity: 0.6, fontSize: 11, paddingHorizontal: 12 },
  playhead: { position: 'absolute', top: 30, width: 2, height: SCORE_HEIGHT - 60, backgroundColor: Palette.cyan, borderRadius: 1 },
  callout: { position: 'absolute', width: 160, backgroundColor: Palette.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
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
  segment: { flexDirection: 'row', backgroundColor: Palette.pill, borderRadius: 999, padding: 3, gap: 2 },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tapChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: Palette.line, paddingHorizontal: 10, paddingVertical: 8 },
  tapChipOn: { backgroundColor: Palette.cyan, borderColor: Palette.cyan },
});
