import { useEffect, useMemo, useRef, type CSSProperties } from 'react'

/*
 * Decorative music graphics: a flowing five-line staff with notes, and loose notes that drift
 * as you scroll. All are aria-hidden; they carry no content.
 */

const STAFF_GAP = 11 // distance between staff lines, in SVG units
const W = 1440
const AMP = 30 // still staffs
const WAVE_AMP = 44 // animated staffs roll taller by default
const STEP_X = 6 // sample spacing along the wave, in SVG units (drawn once, so it can be fine)

/**
 * Every animated staff glides right → left at this one constant speed (SVG units per second),
 * whatever its size or wavelength, so they all move alike.
 */
const WAVE_SPEED = 30

/**
 * Geometry of one staff. `scale` enlarges the staff itself (line spacing, notes, strokes) while
 * the wave keeps its length; `stretch` lengthens the wave. A scaled staff's viewBox is exactly
 * twice the staff's height, so with `slice` the five lines span half of whatever box it fills.
 */
type Geo = { amp: number; gap: number; noteScale: number; H: number; stretch: number; tile: number }
function geometry(amp: number, scale: number, stretch: number): Geo {
  const gap = STAFF_GAP * scale
  // A pure sine repeats every wavelength; a tile is the fewest whole waves that span the width,
  // so notes keep their spacing and the glide wraps without a seam.
  const tile = waveLength(stretch) * Math.ceil(W / waveLength(stretch))
  const H = scale > 1 ? Math.round(gap * 8) : Math.max(240, 2 * Math.ceil(amp + 2 * gap + 40))
  return { amp, gap, noteScale: scale > 1 ? scale * 0.7 : 1, H, stretch, tile }
}

/** One even wave: three across the width, lengthened by `stretch`. */
const waveLength = (stretch: number) => (W / 3) * stretch

/** Vertical centre of the staff at x: a plain, symmetrical sine wave. */
function waveY(x: number, { amp, H, stretch }: Geo) {
  return H / 2 + Math.sin((x / waveLength(stretch)) * Math.PI * 2) * amp
}

function wavePath(to: number, geo: Geo) {
  let d = ''
  for (let x = 0; x <= to; x += STEP_X) d += `${x === 0 ? 'M' : 'L'}${x},${waveY(x, geo).toFixed(2)}`
  return d
}

// [x position along the staff, step from the middle line (each step = half a line gap), kind]
type NoteKind = 'quarter' | 'eighth' | 'half'
type StaffNote = [number, number, NoteKind]
const STAFF_NOTES: StaffNote[] = [
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

/** A big staff keeps every other note so the enlarged heads don't crowd each other. */
const baseNotes = (scale: number) => (scale > 1 ? STAFF_NOTES.filter((_, i) => i % 2 === 0) : STAFF_NOTES)

/**
 * The notes laid along the staff. A still staff shows them once across the width. An animated
 * staff repeats the pattern evenly through two tiles, so when the glide wraps by one tile the
 * picture is identical and the loop has no seam.
 */
function layoutNotes(scale: number, geo: Geo, animated: boolean): StaffNote[] {
  const base = baseNotes(scale)
  if (!animated) return base
  const repeats = Math.max(1, Math.round(geo.tile / W))
  const period = geo.tile / repeats
  const out: StaffNote[] = []
  for (let c = 0; c < repeats * 2; c++) for (const [x, step, kind] of base) out.push([c * period + (x * period) / W, step, kind])
  return out
}

const noteTransform = (x: number, step: number, geo: Geo) =>
  `translate(${x.toFixed(1)} ${(waveY(x, geo) - step * (geo.gap / 2)).toFixed(1)})${
    geo.noteScale !== 1 ? ` scale(${geo.noteScale.toFixed(2)})` : ''
  }`

/**
 * The staff gradient sampled at x, as a colour and alpha. Notes sit inside their own <g>, so a
 * user-space gradient would be read at the note's local origin; each note gets its colour instead.
 */
function paintAt(x: number, from: string, to: string) {
  const f = Math.min(Math.max(x / W, 0), 1)
  const alpha = f < 0.15 ? f / 0.15 : f > 0.85 ? (1 - f) / 0.15 : 1
  const k = Math.min(Math.max((f - 0.15) / 0.7, 0), 1)
  const hex = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16)
  const rgb = [0, 1, 2].map((i) => Math.round(hex(from, i) + (hex(to, i) - hex(from, i)) * k))
  return { color: `rgb(${rgb.join(',')})`, alpha: alpha.toFixed(3) }
}

/** A note drawn around (0, 0); its parent <g> places it on the staff. */
function NoteGlyph({ kind, paint = 'currentColor' }: { kind: NoteKind; paint?: string }) {
  const headW = 7.5
  return (
    <>
      <ellipse
        rx={headW}
        ry={5.2}
        transform="rotate(-22)"
        fill={kind === 'half' ? 'none' : paint}
        stroke={paint}
        strokeWidth={kind === 'half' ? 2 : 0}
      />
      <line x1={headW - 0.8} y1={-1.5} x2={headW - 0.8} y2={-38} stroke={paint} strokeWidth={1.8} />
      {kind === 'eighth' && (
        <path d={`M${headW - 0.8},-38 c 6,6 14,9 11,22`} fill="none" stroke={paint} strokeWidth={2} strokeLinecap="round" />
      )}
    </>
  )
}

/**
 * Drives the glide. The wave is drawn once; each frame only slides the whole staff (lines and
 * notes together) left by `WAVE_SPEED · t`, wrapping by one tile, which looks identical. The
 * gradient is slid back the same amount so the colours and edge fades stay put, and notes near
 * the screen pick up their colour from where they are. Linear, time-based, no per-frame path.
 * Runs only while the staff is on screen, the tab is visible and motion isn't reduced.
 */
function useStaffGlide(
  svgRef: React.RefObject<SVGSVGElement | null>,
  moverRef: React.RefObject<SVGGElement | null>,
  gradRef: React.RefObject<SVGLinearGradientElement | null>,
  noteRefs: React.RefObject<(SVGGElement | null)[]>,
  enabled: boolean,
  geo: Geo,
  notes: StaffNote[],
  speed: number,
  from: string,
  to: string,
) {
  useEffect(() => {
    const svg = svgRef.current
    const mover = moverRef.current
    const grad = gradRef.current
    if (!enabled || !svg || !mover || !grad) return

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const visible = new Array<boolean>(notes.length).fill(true)
    let onScreen = false
    let raf = 0
    let last = 0
    let t = 0 // seconds of motion actually shown (pauses don't count, so nothing jumps)

    const draw = () => {
      const offset = (t * speed) % geo.tile
      mover.setAttribute('transform', `translate(${(-offset).toFixed(2)} 0)`)
      grad.setAttribute('gradientTransform', `translate(${offset.toFixed(2)} 0)`)
      notes.forEach(([x], i) => {
        const g = noteRefs.current[i]
        if (!g) return
        const sx = x - offset
        const show = sx > -120 && sx < W + 120
        if (show) {
          const { color, alpha } = paintAt(sx, from, to)
          g.style.color = color
          g.style.opacity = alpha
        } else if (visible[i]) g.style.opacity = '0'
        visible[i] = show
      })
    }

    const frame = (now: number) => {
      // Real elapsed time, so the speed holds even when frames drop. Only a genuine hitch (a
      // quarter second or more) is capped; resuming resets `last`, so pauses never jump.
      t += Math.min((now - last) / 1000, 0.25)
      last = now
      draw()
      raf = requestAnimationFrame(frame)
    }

    const sync = () => {
      const run = onScreen && !document.hidden && !motion.matches
      if (run && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else if (!run && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      if (motion.matches && t !== 0) {
        t = 0
        draw() // settle back to the still design
      }
    }

    draw()
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      sync()
    })
    io.observe(svg)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      cancelAnimationFrame(raf)
    }
  }, [svgRef, moverRef, gradRef, noteRefs, enabled, geo, notes, speed, from, to])
}

/**
 * A wide, flowing staff. `className` positions it; it scales to the container width.
 * The gradient runs cyan → amber like the rest of the brand. With `wave`, the staff glides
 * slowly right → left, its notes riding along.
 */
export function FlowingStaff({
  className = '',
  id,
  opacity = 0.32,
  mono = false,
  wave = false,
  amp: ampProp,
  scale = 1,
  stretch = 1,
  speed = WAVE_SPEED,
}: {
  className?: string
  id: string
  opacity?: number
  /** Neutral grey instead of the cyan → amber brand gradient. */
  mono?: boolean
  /** Animate the staff gliding as a wave (paused off-screen and for reduced motion). */
  wave?: boolean
  /** Wave amplitude in SVG units (the viewBox is 1440 wide); taller waves get a taller viewBox. */
  amp?: number
  /** Enlarge the staff itself (lines, notes). Above 1, the five lines span half the box's height. */
  scale?: number
  /** Lengthen the wave (1 = three even waves across the width). */
  stretch?: number
  /** Glide speed in SVG units per second (default: the shared `WAVE_SPEED`). */
  speed?: number
}) {
  const from = mono ? '#d4d4d4' : '#04c1ff'
  const to = mono ? '#d4d4d4' : '#eda145'
  const amp = ampProp ?? (wave ? WAVE_AMP : AMP)
  const geo = useMemo(() => geometry(amp, scale, stretch), [amp, scale, stretch])
  const notes = useMemo(() => layoutNotes(scale, geo, wave), [scale, geo, wave])
  const pathD = useMemo(() => wavePath(wave ? W + geo.tile : W, geo), [wave, geo])
  const H = geo.H
  const gradId = `staff-grad-${id}`
  const lineId = `staff-line-${id}`
  const svgRef = useRef<SVGSVGElement>(null)
  const moverRef = useRef<SVGGElement>(null)
  const gradRef = useRef<SVGLinearGradientElement>(null)
  const noteRefs = useRef<(SVGGElement | null)[]>([])
  useStaffGlide(svgRef, moverRef, gradRef, noteRefs, wave, geo, notes, speed, from, to)
  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none ${className}`}
      style={{ opacity, overflow: scale > 1 ? 'visible' : undefined }}
    >
      <defs>
        <linearGradient ref={gradRef} id={gradId} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">
          <stop offset="0" stopColor={from} stopOpacity="0" />
          <stop offset="0.15" stopColor={from} />
          <stop offset="0.85" stopColor={to} />
          <stop offset="1" stopColor={to} stopOpacity="0" />
        </linearGradient>
        <path id={lineId} d={pathD} />
      </defs>
      <g ref={moverRef}>
        <g stroke={`url(#${gradId})`} fill="none" strokeWidth={1.2 * Math.sqrt(scale)}>
          {[-2, -1, 0, 1, 2].map((i) => (
            <use key={i} href={`#${lineId}`} y={i * geo.gap} />
          ))}
        </g>
        {notes.map(([x, step, kind], i) => {
          const { color, alpha } = paintAt(x, from, to)
          return (
            <g
              key={i}
              ref={(el) => {
                noteRefs.current[i] = el
              }}
              transform={noteTransform(x, step, geo)}
              style={{ color, opacity: alpha }}
            >
              <NoteGlyph kind={kind} />
            </g>
          )
        })}
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
