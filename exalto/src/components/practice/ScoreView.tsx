import { memo, useMemo } from 'react';
import Svg, { Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { FontFamily, Palette } from '@/constants/theme';
import { VOICES, type PracticeData, type PracticeNote, type Voice } from '@/lib/practice';

/** Draws practice.json as one long grand staff that scrolls sideways (no MusicXML renderer). */
export const PX_PER_BEAT = 34;
const GAP = 8; // staff line spacing
const STEP = GAP / 2;
const TREBLE_TOP = 44;
const BASS_TOP = 156;
const PAD = 12; // space after each barline
const HEAD_X = 70; // where measure 1 starts, after clefs and key signature
export const SCORE_HEIGHT = BASS_TOP + 4 * GAP + 46;
const INK = '#2A2016';
export const VOICE_COLOR: Record<Voice, string> = { soprano: Palette.cyan, alto: '#C9801C', tenor: '#3E9F6B', bass: '#7B63D6' };

const ACC: Record<string, string> = { b: '♭', '#': '♯', n: '♮', bb: '𝄫', '##': '𝄪' };
const staffBottom = (staff: 0 | 1) => (staff === 0 ? TREBLE_TOP : BASS_TOP) + 4 * GAP;

export type Layout = { measureX: number[]; width: number; xOf: (beat: number) => number };

export function scoreLayout(data: PracticeData): Layout {
  const measureX: number[] = [];
  let x = HEAD_X;
  for (const m of data.measures) {
    measureX.push(x);
    x += PAD + m.beats * PX_PER_BEAT;
  }
  const xOf = (beat: number) => {
    let i = 0;
    while (i + 1 < data.measures.length && data.measures[i + 1].start <= beat) i++;
    const m = data.measures[i];
    return measureX[i] + PAD + (beat - m.start) * PX_PER_BEAT;
  };
  return { measureX, width: x + 24, xOf };
}

/** The point a notehead is drawn at (for callouts). */
export function notePoint(data: PracticeData, layout: Layout, voice: Voice, n: PracticeNote) {
  const staff = data.voices[voice].staff;
  return { x: layout.xOf(n.start) + 5, y: staffBottom(staff) - (n.y ?? 0) * STEP };
}

type Props = {
  data: PracticeData;
  layout: Layout;
  /** Voices drawn faded (another voice is soloed). */
  faded: Set<Voice>;
  /** Highlighted note (tap-a-note). */
  activeId: string | null;
  onNoteIn?: (voice: Voice, n: PracticeNote) => void;
  onNoteOut?: (voice: Voice, n: PracticeNote) => void;
};

export const ScoreView = memo(function ScoreView({ data, layout, faded, activeId, onNoteIn, onNoteOut }: Props) {
  const staticParts = useMemo(() => <Staff data={data} layout={layout} />, [data, layout]);
  return (
    <Svg width={layout.width} height={SCORE_HEIGHT}>
      {staticParts}
      {VOICES.map((v) => (
        <G key={v} opacity={faded.has(v) ? 0.18 : 1}>
          <VoiceNotes data={data} layout={layout} voice={v} activeId={activeId} onNoteIn={onNoteIn} onNoteOut={onNoteOut} />
        </G>
      ))}
      <Lyrics data={data} layout={layout} />
    </Svg>
  );
});

function Staff({ data, layout }: { data: PracticeData; layout: Layout }) {
  const right = layout.width - 24;
  const els = [];
  for (const top of [TREBLE_TOP, BASS_TOP]) for (let i = 0; i < 5; i++) els.push(<Line key={`l${top}${i}`} x1={8} x2={right} y1={top + i * GAP} y2={top + i * GAP} stroke={INK} strokeWidth={0.8} />);
  els.push(<Rect key="brace" x={3} y={TREBLE_TOP} width={2.4} height={BASS_TOP + 4 * GAP - TREBLE_TOP} fill={INK} />);
  for (const x of [8, ...layout.measureX.slice(1), right]) els.push(<Line key={`b${x}`} x1={x} x2={x} y1={TREBLE_TOP} y2={BASS_TOP + 4 * GAP} stroke={INK} strokeWidth={1} />);
  els.push(<SvgText key="g" x={11} y={TREBLE_TOP + 4 * GAP + 7} fontSize={44} fill={INK}>𝄞</SvgText>);
  els.push(<SvgText key="f" x={12} y={BASS_TOP + 3 * GAP + 4} fontSize={30} fill={INK}>𝄢</SvgText>);
  data.staves.forEach((s, si) =>
    s.keyAccidentals.forEach((a, i) =>
      els.push(
        <SvgText key={`k${si}${i}`} x={40 + i * 8} y={staffBottom(si as 0 | 1) - a.y * STEP + 4} fontSize={16} fill={INK}>
          {a.alter < 0 ? '♭' : '♯'}
        </SvgText>,
      ),
    ),
  );
  data.measures.forEach((m, i) =>
    els.push(
      <SvgText key={`n${m.n}`} x={layout.measureX[i] + 3} y={TREBLE_TOP - 14} fontSize={10} fill={INK} opacity={0.55} fontFamily={FontFamily.semibold}>
        {m.n}
      </SvgText>,
    ),
  );
  return <G>{els}</G>;
}

function VoiceNotes({ data, layout, voice, activeId, onNoteIn, onNoteOut }: { data: PracticeData; layout: Layout; voice: Voice; activeId: string | null } & Pick<Props, 'onNoteIn' | 'onNoteOut'>) {
  const { notes, stem, staff } = data.voices[voice];
  const up = stem === 'up';
  const bottom = staffBottom(staff);
  const els = [];
  const pt = (n: PracticeNote) => ({ x: layout.xOf(n.start) + 5, y: bottom - (n.y ?? 0) * STEP });
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.rest) continue;
    const { x, y } = pt(n);
    const color = n.id === activeId ? VOICE_COLOR[voice] : INK;
    const hollow = n.type === 'half' || n.type === 'whole';
    // ledger lines above/below the staff
    for (let s = -2; s >= (n.y ?? 0); s -= 2) els.push(<Line key={`${n.id}l${s}`} x1={x - 8} x2={x + 8} y1={bottom - s * STEP} y2={bottom - s * STEP} stroke={INK} strokeWidth={0.9} />);
    for (let s = 10; s <= (n.y ?? 0); s += 2) els.push(<Line key={`${n.id}l${s}`} x1={x - 8} x2={x + 8} y1={bottom - s * STEP} y2={bottom - s * STEP} stroke={INK} strokeWidth={0.9} />);
    els.push(
      <Ellipse key={n.id} cx={x} cy={y} rx={5.2} ry={3.9} fill={hollow ? 'none' : color} stroke={color} strokeWidth={hollow ? 1.4 : 0} transform={`rotate(-20 ${x} ${y})`} />,
    );
    if (n.acc) els.push(<SvgText key={`${n.id}a`} x={x - 15} y={y + 4} fontSize={14} fill={color}>{ACC[n.acc] ?? ''}</SvgText>);
    for (let d = 0; d < n.dots; d++) els.push(<Ellipse key={`${n.id}d${d}`} cx={x + 9 + d * 4} cy={(n.y ?? 0) % 2 === 0 ? y - STEP / 2 - 0.5 : y} rx={1.4} ry={1.4} fill={color} />);
    if (n.type === 'whole') continue;
    // stem, lengthened to meet a beam partner
    let len = 26;
    const partner = n.beam === 'begin' || n.beam === 'continue' ? notes[i + 1] : n.beam === 'end' ? notes[i - 1] : null;
    if (partner && !partner.rest) {
      const py = pt(partner).y;
      len += up ? Math.max(0, y - py) : Math.max(0, py - y);
    }
    const sx = up ? x + 4.8 : x - 4.8;
    const sy2 = up ? y - len : y + len;
    els.push(<Line key={`${n.id}s`} x1={sx} x2={sx} y1={y} y2={sy2} stroke={color} strokeWidth={1.1} />);
    if ((n.beam === 'begin' || n.beam === 'continue') && notes[i + 1]) {
      const q = pt(notes[i + 1]);
      const by = up ? Math.min(y, q.y) - 26 : Math.max(y, q.y) + 26;
      const qx = up ? q.x + 4.8 : q.x - 4.8;
      els.push(<Rect key={`${n.id}bm`} x={sx} y={up ? by : by - 3.5} width={qx - sx + 1} height={3.5} fill={INK} />);
    } else if (!n.beam && (n.type === 'eighth' || n.type === '16th')) {
      const d = up ? `M${sx} ${sy2} c1 6 8 8 6 15` : `M${sx} ${sy2} c1 -6 8 -8 6 -15`;
      els.push(<Path key={`${n.id}f`} d={d} stroke={color} strokeWidth={1.5} fill="none" />);
    }
    // invisible hit area for tap / hold
    if (onNoteIn)
      els.push(
        <Rect
          key={`${n.id}h`}
          x={x - 11}
          y={y - 11}
          width={22}
          height={22}
          fill="#000"
          fillOpacity={0.001}
          onPressIn={() => onNoteIn(voice, n)}
          onPressOut={() => onNoteOut?.(voice, n)}
        />,
      );
  }
  return <G>{els}</G>;
}

function Lyrics({ data, layout }: { data: PracticeData; layout: Layout }) {
  const y = TREBLE_TOP + 4 * GAP + 44;
  return (
    <G>
      {data.voices.soprano.notes.map((n) => {
        const l = n.lyrics?.find((x) => x.verse === 1);
        if (!l) return null;
        const text = l.syllabic === 'begin' || l.syllabic === 'middle' ? `${l.text}-` : l.text;
        return (
          <SvgText key={n.id} x={layout.xOf(n.start) + 5} y={y} fontSize={11} textAnchor="middle" fill={INK} fontFamily={FontFamily.regular}>
            {text}
          </SvgText>
        );
      })}
    </G>
  );
}
