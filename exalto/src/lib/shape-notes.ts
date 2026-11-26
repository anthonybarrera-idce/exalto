/**
 * Seven-shape notes (Aikin): each notehead's shape shows its step in the key's major scale —
 * do triangle, re half-moon, mi diamond, fa right triangle, sol oval, la square, ti cone.
 * The step comes from the note's letter, so a sharp or flat keeps its letter's shape.
 */
export type Shape = 'do' | 're' | 'mi' | 'fa' | 'sol' | 'la' | 'ti';

const SHAPES: Shape[] = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
const LETTERS = 'CDEFGAB';

/** The shape of a note ("Eb4", "F#3"…) in a major key with `fifths` sharps (negative: flats). */
export function shapeOf(pitch: string, fifths: number): Shape {
  const letter = LETTERS.indexOf(pitch.charAt(0).toUpperCase());
  if (letter < 0) return 'sol';
  const tonic = (((fifths * 4) % 7) + 7) % 7; // C=0, G=4, D=1, F=3, B♭=6…
  return SHAPES[(letter - tonic + 7) % 7];
}

/**
 * SVG path for a shape centred at (x, y), `w` wide and `h` tall; null for sol (draw the usual oval).
 * `up`: the stem goes up (fa's upright side sits on the stem's side).
 */
export function shapePath(shape: Shape, x: number, y: number, w: number, h: number, up = true): string | null {
  const a = w / 2;
  const b = h / 2;
  const f = (n: number) => n.toFixed(2);
  const P = (...pts: [number, number][]) => `M ${pts.map(([px, py]) => `${f(x + px)} ${f(y + py)}`).join(' L ')} Z`;
  switch (shape) {
    case 'do':
      return P([-a, b], [0, -b], [a, b]);
    case 're': {
      const top = -b * 0.45;
      return `M ${f(x - a)} ${f(y + top)} L ${f(x + a)} ${f(y + top)} A ${f(a)} ${f(b * 1.45)} 0 0 1 ${f(x - a)} ${f(y + top)} Z`;
    }
    case 'mi':
      return P([0, -b], [a, 0], [0, b], [-a, 0]);
    case 'fa':
      return up ? P([-a, b], [a, -b], [a, b]) : P([-a, -b], [-a, b], [a, b]);
    case 'la':
      return P([-a * 0.85, -b], [a * 0.85, -b], [a * 0.85, b], [-a * 0.85, b]);
    case 'ti':
      return `M ${f(x - a)} ${f(y - b * 0.25)} Q ${f(x)} ${f(y - b * 1.5)} ${f(x + a)} ${f(y - b * 0.25)} L ${f(x)} ${f(y + b)} Z`;
    default:
      return null;
  }
}
