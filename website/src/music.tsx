import type { CSSProperties } from 'react'

/*
 * Decorative music graphics: a flowing five-line staff with notes, and loose notes that drift
 * as you scroll. All are aria-hidden; they carry no content.
 */

const STAFF_GAP = 11 // distance between staff lines, in SVG units

/** Vertical centre of the flowing staff at x (a gentle double wave across the width). */
function waveY(x: number, w: number, base: number, amp: number) {
  return base + Math.sin((x / w) * Math.PI * 2 + 0.6) * amp + Math.sin((x / w) * Math.PI * 5) * (amp * 0.25)
}

function wavePath(w: number, base: number, amp: number, offset: number) {
  const pts: string[] = []
  for (let x = 0; x <= w; x += 24) pts.push(`${x === 0 ? 'M' : 'L'}${x},${(waveY(x, w, base, amp) + offset).toFixed(1)}`)
  return pts.join(' ')
}

// [x position along the staff, step from the middle line (each step = half a line gap), kind]
type NoteKind = 'quarter' | 'eighth' | 'half'
const STAFF_NOTES: [number, number, NoteKind][] = [
  [140, 2, 'quarter'],
  [210, 0, 'quarter'],
  [280, -2, 'eighth'],
  [420, 1, 'half'],
  [520, 3, 'quarter'],
  [590, 1, 'quarter'],
  [660, -1, 'eighth'],
  [800, -3, 'half'],
  [930, 0, 'quarter'],
  [1000, 2, 'quarter'],
  [1070, 4, 'eighth'],
  [1210, 1, 'half'],
  [1300, -1, 'quarter'],
]

function NoteOnStaff({ x, y, kind, paint }: { x: number; y: number; kind: NoteKind; paint: string }) {
  const stemUp = true
  const headW = 7.5
  return (
    <g>
      <ellipse
        cx={x}
        cy={y}
        rx={headW}
        ry={5.2}
        transform={`rotate(-22 ${x} ${y})`}
        fill={kind === 'half' ? 'none' : paint}
        stroke={paint}
        strokeWidth={kind === 'half' ? 2 : 0}
      />
      {stemUp && <line x1={x + headW - 0.8} y1={y - 1.5} x2={x + headW - 0.8} y2={y - 38} stroke={paint} strokeWidth={1.8} />}
      {kind === 'eighth' && (
        <path
          d={`M${x + headW - 0.8},${y - 38} c 6,6 14,9 11,22`}
          fill="none"
          stroke={paint}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

/**
 * A wide, flowing staff. `className` positions it; it scales to the container width.
 * The gradient runs cyan → amber like the rest of the brand.
 */
export function FlowingStaff({
  className = '',
  id,
  opacity = 0.32,
  mono = false,
}: {
  className?: string
  id: string
  opacity?: number
  /** Neutral grey instead of the cyan → amber brand gradient. */
  mono?: boolean
}) {
  const from = mono ? '#d4d4d4' : '#04c1ff'
  const to = mono ? '#d4d4d4' : '#eda145'
  const W = 1440
  const H = 220
  const base = 110
  const amp = 30
  const gradId = `staff-grad-${id}`
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none ${className}`}
      style={{ opacity }}
    >
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" stopColor={from} stopOpacity="0" />
          <stop offset="0.15" stopColor={from} />
          <stop offset="0.85" stopColor={to} />
          <stop offset="1" stopColor={to} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gradId})`} fill="none" strokeWidth={1.2}>
        {[-2, -1, 0, 1, 2].map((i) => (
          <path key={i} d={wavePath(W, base, amp, i * STAFF_GAP)} />
        ))}
      </g>
      <g>
        {STAFF_NOTES.map(([x, step, kind]) => (
          <NoteOnStaff key={x} x={x} y={waveY(x, W, base, amp) - step * (STAFF_GAP / 2)} kind={kind} paint={`url(#${gradId})`} />
        ))}
      </g>
    </svg>
  )
}

/* ---------- Loose notes ---------- */

type Glyph = 'eighth' | 'beamed' | 'quarter' | 'clef'

function GlyphSvg({ glyph }: { glyph: Glyph }) {
  switch (glyph) {
    case 'eighth':
      return (
        <svg viewBox="0 0 40 60" className="size-full" fill="currentColor">
          <ellipse cx="13" cy="48" rx="10" ry="7" transform="rotate(-22 13 48)" />
          <rect x="21" y="6" width="3" height="42" rx="1.5" />
          <path d="M22.5,6 c 8,7 18,10 13,28 c 1,-12 -5,-16 -13,-18 z" />
        </svg>
      )
    case 'beamed':
      return (
        <svg viewBox="0 0 64 60" className="size-full" fill="currentColor">
          <ellipse cx="13" cy="48" rx="10" ry="7" transform="rotate(-22 13 48)" />
          <ellipse cx="47" cy="42" rx="10" ry="7" transform="rotate(-22 47 42)" />
          <rect x="21" y="8" width="3" height="40" rx="1.5" />
          <rect x="55" y="2" width="3" height="40" rx="1.5" />
          <path d="M21,8 L58,2 L58,10 L21,16 z" />
        </svg>
      )
    case 'quarter':
      return (
        <svg viewBox="0 0 32 60" className="size-full" fill="currentColor">
          <ellipse cx="13" cy="48" rx="10" ry="7" transform="rotate(-22 13 48)" />
          <rect x="21" y="4" width="3" height="44" rx="1.5" />
        </svg>
      )
    case 'clef':
      // A simplified treble clef drawn as one stroke.
      return (
        <svg viewBox="0 0 48 100" className="size-full" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
          <path d="M27,92 c -8,4 -16,-2 -12,-9 c 3,-5 11,-3 11,3 L22,8 c 0,-6 9,-8 11,0 c 3,12 -24,24 -24,44 c 0,14 14,20 24,14 c 10,-6 6,-22 -6,-22 c -10,0 -14,10 -8,16" />
        </svg>
      )
  }
}

export type LooseNote = {
  glyph: Glyph
  /** Position as % of the section, and size in px. */
  left: string
  top: string
  size: number
  rotate?: number
  /** How far it drifts while the section scrolls past (px). Bigger = feels closer. */
  drift?: number
  tone?: 'cyan' | 'amber' | 'orange' | 'grey'
  opacity?: number
}

const TONE = { cyan: '#04c1ff', amber: '#f5c080', orange: '#eda145', grey: '#d4d4d4' }

/** Scattered notes for a section background. The parent must be `relative`. */
export function LooseNotes({ notes, className = '' }: { notes: LooseNote[]; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {notes.map((n, i) => (
        <span
          key={i}
          className="drift absolute block"
          style={
            {
              left: n.left,
              top: n.top,
              width: n.size,
              height: n.size * (n.glyph === 'clef' ? 2 : 1),
              color: TONE[n.tone ?? 'amber'],
              opacity: n.opacity ?? 0.16,
              rotate: `${n.rotate ?? 0}deg`,
              '--drift': `${n.drift ?? 60}px`,
            } as CSSProperties
          }
        >
          <GlyphSvg glyph={n.glyph} />
        </span>
      ))}
    </div>
  )
}
