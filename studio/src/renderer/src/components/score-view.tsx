import { OpenSheetMusicDisplay } from "opensheetmusicdisplay"
import { useEffect, useRef, useState } from "react"
import { usePressHold } from "@/hooks/use-press-hold"
import { useTheme } from "@/hooks/use-theme"
import { useLocale } from "@/hooks/use-locale"
import { shapeOf, shapePath } from "@/lib/shape-notes"
import { cn } from "@/lib/utils"
import type { HeldTone } from "@/lib/tone"

/** What was clicked: the beat (for seeking) and the single note under the pointer (for auditioning). */
export type ScoreHit = {
  beat: number
  note?: { frequency: number; quarters: number; staff: number; name: string; voice: string }
}
type Flash = { x: number; y: number; label: string; key: number; ms: number; held?: boolean }
export type VoiceId = "soprano" | "alto" | "tenor" | "bass"
/** A drawn note: when it sounds (beats), which voice sings it, and its notehead shapes. */
type DrawnNote = { start: number; end: number; voice: VoiceId; heads: SVGElement[]; letter: string; hollow: boolean }

type Props = {
  /** MusicXML text (re-renders when it changes, keeping the scroll position) */
  xml: string | null
  /** Playback/selection position in quarter-note beats */
  beat: number
  /**
   * Return how many seconds a clicked note sounds to highlight and label it meanwhile, or the
   * sounding note itself so that pressing and holding keeps it (and the label) going until release.
   */
  onHit?: (hit: ScoreHit) => number | HeldTone | void
  /** Hint shown on hover */
  hint?: string
  /** Colour the notes sounding at `beat` in these voices (only the voices listed). */
  voiceColors?: Partial<Record<VoiceId, string>>
  /** One long line that scrolls sideways (the playhead stays centred), like the mobile app. */
  horizontal?: boolean
  /** Draw seven-shape noteheads for a major key with this many sharps (negative: flats); null = round */
  shapesFifths?: number | null
  /** Scroll the view to keep the playback cursor in sight (off: the view stays where the user put it) */
  follow?: boolean
  /**
   * Sideways score only: keep the playhead in view by scrolling the score ourselves (instantly),
   * e.g. while playing. Works when the window isn't focused, unlike OSMD's smooth follow.
   */
  followPlayhead?: boolean
}

const ACCENT = "#0ea5e9"

/** Renders the score with OpenSheetMusicDisplay and moves a note cursor and a measure shade to `beat`. */
export function ScoreView({ xml, beat, onHit, hint, voiceColors, horizontal = false, shapesFifths = null, follow = true, followPlayhead = false }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const osmd = useRef<OpenSheetMusicDisplay | null>(null)
  const steps = useRef<number[]>([])
  const drawn = useRef<DrawnNote[]>([])
  const lit = useRef<Set<SVGElement>>(new Set())
  const at = useRef(0)
  const [ready, setReady] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const { resolved } = useTheme()
  const { t, voiceName } = useLocale()
  const hold = usePressHold()
  useEffect(() => {
    if (!flash || flash.held) return
    const t = setTimeout(() => setFlash((f) => (f?.key === flash.key ? null : f)), flash.ms)
    return () => clearTimeout(t)
  }, [flash])

  // One OSMD instance per theme (note colours are baked into the drawing)
  useEffect(() => {
    if (!host.current) return
    const ink = resolved === "dark" ? "#e5e5e5" : "#0a0a0a"
    const o = new OpenSheetMusicDisplay(host.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawPartNames: false,
      followCursor: follow,
      renderSingleHorizontalStaffline: horizontal,
      defaultColorMusic: ink,
      defaultColorLabel: ink,
      defaultColorStem: ink,
      defaultColorRest: ink,
      defaultColorTitle: ink,
      cursorsOptions: [
        { type: 0, color: ACCENT, alpha: 0.55, follow: true },
        { type: 3, color: ACCENT, alpha: 0.1, follow: false },
      ],
    })
    // More room between lyric syllables: hymns stack several verses, and OSMD's default spacing
    // lets the hyphens run through the words.
    o.EngravingRules.HorizontalBetweenLyricsDistance = 0.9
    o.EngravingRules.LyricsXPaddingFactorForLongLyrics = 1.6
    osmd.current = o
    return () => {
      o.clear()
      osmd.current = null
    }
  }, [resolved, horizontal, follow])

  // (Re)load whenever the MusicXML changes; keep where the user had scrolled to.
  useEffect(() => {
    const o = osmd.current
    if (!o || !xml) return
    let cancelled = false
    const scroller = host.current?.closest(".overflow-y-auto, .overflow-x-auto") as HTMLElement | null
    const keep = scroller?.scrollTop ?? 0
    const keepX = scroller?.scrollLeft ?? 0
    ;(async () => {
      try {
        await o.load(xml)
        if (cancelled) return
        o.zoom = 0.8
        o.render()
        const c = o.cursor
        c.reset()
        const s: number[] = []
        while (!c.iterator.EndReached) {
          s.push(c.iterator.currentTimeStamp.RealValue * 4)
          c.next()
        }
        steps.current = s
        drawn.current = collectNotes(o)
        lit.current.clear()
        at.current = 0
        o.cursors.forEach((k) => (k.reset(), k.show()))
        if (scroller) (scroller.scrollTop = keep), (scroller.scrollLeft = keepX)
        setError(null)
        setReady((r) => r + 1)
      } catch (e) {
        setError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [xml, resolved, horizontal, follow])

  // Move the cursors to `beat`
  useEffect(() => {
    const o = osmd.current
    const s = steps.current
    if (!o || !s.length) return
    let target = 0
    while (target + 1 < s.length && s[target + 1] <= beat + 1e-3) target++
    if (target < at.current) {
      o.cursors.forEach((k) => k.reset())
      at.current = 0
    }
    while (at.current < target) {
      o.cursors.forEach((k) => k.next())
      at.current++
    }
    // The staff moves along with the music: once the playhead passes 40% of the view (or falls
    // behind 10%), glide it back to 30%. Short, frequent glides read as one steady motion. Driven by
    // our own frames (not CSS smooth scrolling), so it keeps going when the window isn't focused.
    if (followPlayhead && horizontal) {
      const scroller = host.current?.closest(".overflow-x-auto") as HTMLElement | null
      const el = o.cursors[0]?.cursorElement
      if (scroller && el) {
        const r = el.getBoundingClientRect()
        const s = scroller.getBoundingClientRect()
        // (Not again while a glide is under way: restarting it every frame would only creep.)
        if (!gliding.current && r.width && (r.left < s.left + s.width * 0.1 || r.left > s.left + s.width * 0.4)) {
          glideTo(scroller, scroller.scrollLeft + r.left - (s.left + s.width * 0.3), s.width)
        }
      }
    }
  }, [beat, ready, followPlayhead, horizontal])
  useEffect(() => () => cancelAnimationFrame(glide.current), [])
  const glide = useRef(0)
  const gliding = useRef(false)
  // Pausing stops a glide where it is.
  useEffect(() => {
    if (!followPlayhead) (cancelAnimationFrame(glide.current), (gliding.current = false))
  }, [followPlayhead])
  const glideTo = (el: HTMLElement, to: number, view: number) => {
    cancelAnimationFrame(glide.current)
    gliding.current = false
    const from = el.scrollLeft
    // A seek far away, or reduced motion: no glide, just go there.
    if (Math.abs(to - from) > view || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.scrollLeft = to
      return
    }
    const t0 = performance.now()
    const ms = 450
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2 // ease in-out
      el.scrollLeft = from + (to - from) * ease
      if (k < 1) glide.current = requestAnimationFrame(step)
      else gliding.current = false
    }
    gliding.current = true
    glide.current = requestAnimationFrame(step)
  }

  // Shape notes: draw each notehead's shape over it (OSMD only draws round heads).
  useEffect(() => {
    const ink = resolved === "dark" ? "#e5e5e5" : "#0a0a0a"
    for (const n of drawn.current) for (const h of n.heads) setShape(h, n, shapesFifths, ink)
    lit.current.clear()
  }, [ready, shapesFifths, resolved])

  // Colour the notes sounding now, each in its voice's colour.
  const colorKey = JSON.stringify(voiceColors ?? {})
  useEffect(() => {
    const next = new Map<SVGElement, string>()
    if (voiceColors) {
      for (const n of drawn.current) {
        const color = voiceColors[n.voice]
        if (color && n.start <= beat + 1e-3 && beat + 1e-3 < n.end) n.heads.forEach((h) => next.set(h, color))
      }
    }
    for (const h of lit.current) if (!next.has(h)) paint(h, null)
    for (const [h, color] of next) paint(h, color)
    lit.current = new Set(next.keys())
  }, [beat, ready, colorKey, shapesFifths]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click: the measure under the pointer, the note at or left of it (for the beat), and the
  // single notehead nearest the pointer (for auditioning).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !onHit) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onClick(e)
  }
  const onClick = (e: React.MouseEvent) => {
    const o = osmd.current
    const svg = host.current?.querySelector("svg")
    if (!o || !svg || !onHit) return
    const r = svg.getBoundingClientRect()
    const unit = 10 * o.zoom
    const x = (e.clientX - r.left) / unit
    const y = (e.clientY - r.top) / unit
    for (const column of o.GraphicSheet.MeasureList) {
      for (const gm of column) {
        const sys = gm?.ParentMusicSystem?.PositionAndShape
        if (!gm || !sys) continue
        const box = gm.PositionAndShape
        const top = sys.AbsolutePosition.y + sys.BorderTop
        const bottom = sys.AbsolutePosition.y + sys.BorderBottom
        const left = box.AbsolutePosition.x + box.BorderLeft
        const right = box.AbsolutePosition.x + box.BorderRight
        if (y < top - 2 || y > bottom + 4 || x < left || x > right) continue
        // Look across both staves of this measure for the nearest notehead
        const staves = column.filter((m) => m && m.ParentMusicSystem === gm.ParentMusicSystem)
        let beat = gm.parentSourceMeasure.AbsoluteTimestamp.RealValue * 4
        let best: { d: number; note: ScoreHit["note"]; beat: number; px: number; py: number } | null = null
        staves.forEach((sm, staffIdx) => {
          for (const se of sm.staffEntries) {
            const sx = se.PositionAndShape.AbsolutePosition.x
            const seBeat = se.getAbsoluteTimestamp().RealValue * 4
            if (staffIdx === 0 && sx - 1 <= x) beat = Math.max(beat, seBeat)
            for (const gve of se.graphicalVoiceEntries) {
              for (const gn of gve.notes) {
                const n = gn.sourceNote
                if (!n || n.isRest() || !n.Pitch) continue
                const p = gn.PositionAndShape.AbsolutePosition
                const d = Math.hypot(p.x - x, (p.y - y) * 1.2)
                if (!best || d < best.d) {
                  const voiceId = gve.parentVoiceEntry?.ParentVoice?.VoiceId ?? 1
                  const lower = sm.staffEntries.some((e) => e.graphicalVoiceEntries.some((v) => (v.parentVoiceEntry?.ParentVoice?.VoiceId ?? 1) < voiceId))
                  const voice = voiceName(staffIdx === 0 ? (lower ? "alto" : "soprano") : lower ? "bass" : "tenor")
                  best = {
                    d,
                    beat: seBeat,
                    px: p.x,
                    py: p.y,
                    note: { frequency: n.Pitch.Frequency, quarters: n.Length.RealValue * 4, staff: staffIdx, name: noteName(n.Pitch), voice },
                  }
                }
              }
            }
          }
        })
        const hit = best as { d: number; note: ScoreHit["note"]; beat: number; px: number; py: number } | null
        const near = hit && hit.d < 3
        const res = onHit(near ? { beat: hit.beat, note: hit.note } : { beat })
        const tone = res && typeof res === "object" ? res : null
        const seconds = tone ? tone.seconds : res
        const key = Date.now()
        // Held past a moment: keep the note and its label up until the press ends.
        hold.press(tone, {
          hold: () => setFlash((f) => (f?.key === key ? { ...f, held: true } : f)),
          end: () => setFlash((f) => (f?.key === key ? null : f)),
        })
        if (near && typeof seconds === "number" && wrap.current) {
          const w = wrap.current.getBoundingClientRect()
          setFlash({
            x: r.left - w.left + hit.px * unit,
            y: r.top - w.top + hit.py * unit,
            label: `${hit.note!.name} · ${hit.note!.voice}`,
            key,
            ms: Math.max(600, seconds * 1000),
          })
        }
        return
      }
    }
  }

  if (error) return <div className="p-6 text-sm text-muted-foreground">{t("score.error", { error })}</div>
  return (
    <div ref={wrap} className={horizontal ? "relative w-max min-w-full" : "relative w-full"}>
      <div
        ref={host}
        onPointerDown={onPointerDown}
        onPointerUp={hold.release}
        onPointerCancel={hold.release}
        onLostPointerCapture={hold.release}
        onPointerLeave={hold.release}
        className={cn(horizontal ? "w-max min-w-full" : "w-full", onHit && "cursor-pointer")} aria-label={t("score.label")} title={hint} />
      {flash && (
        <div key={flash.key} className="pointer-events-none absolute" style={{ left: flash.x, top: flash.y }} aria-live="polite">
          <span className="absolute size-5 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sky-500/40" />
          <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-500" />
          <span className="absolute -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-md bg-sky-600 px-2 py-0.5 text-xs font-medium text-white shadow">
            ♪ {flash.label}
          </span>
        </div>
      )}
    </div>
  )
}

/** "F♯4" style name from an OSMD pitch. */
function noteName(p: { FundamentalNote: number; AccidentalHalfTones: number; Frequency: number }): string {
  const letters: Record<number, string> = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" }
  const letter = letters[p.FundamentalNote] ?? "?"
  const acc = p.AccidentalHalfTones === 1 ? "♯" : p.AccidentalHalfTones === -1 ? "♭" : p.AccidentalHalfTones === 2 ? "𝄪" : p.AccidentalHalfTones === -2 ? "𝄫" : ""
  const midi = Math.round(69 + 12 * Math.log2(p.Frequency / 440))
  const natural = midi - p.AccidentalHalfTones
  return `${letter}${acc}${Math.floor(natural / 12) - 1}`
}

/** Every pitched note in the rendered score with its timing, voice and notehead shapes. */
function collectNotes(o: OpenSheetMusicDisplay): DrawnNote[] {
  const out: DrawnNote[] = []
  for (const column of o.GraphicSheet?.MeasureList ?? []) {
    column.forEach((gm, staffIdx) => {
      if (!gm || staffIdx > 1) return
      // The first voice on a staff is the upper one (soprano / tenor), the next the lower one.
      const ids = [...new Set(gm.staffEntries.flatMap((e) => e.graphicalVoiceEntries.map((v) => v.parentVoiceEntry?.ParentVoice?.VoiceId ?? 1)))].sort((a, b) => a - b)
      for (const se of gm.staffEntries) {
        const start = se.getAbsoluteTimestamp().RealValue * 4
        for (const gve of se.graphicalVoiceEntries) {
          const lower = ids.indexOf(gve.parentVoiceEntry?.ParentVoice?.VoiceId ?? 1) > 0
          const voice: VoiceId = staffIdx === 0 ? (lower ? "alto" : "soprano") : lower ? "bass" : "tenor"
          const pitched = gve.notes.filter((gn) => gn.sourceNote && !gn.sourceNote.isRest() && gn.sourceNote.Pitch)
          if (!pitched.length) continue
          // OSMD gives every note of a chord all of the chord's heads: pair them up by height
          // (highest note ↔ topmost head).
          const all = ((pitched[0] as unknown as { getNoteheadSVGs?: () => SVGElement[] }).getNoteheadSVGs?.() ?? []).filter(Boolean)
          const top = (el: SVGElement) => {
            try {
              return (el as unknown as SVGGraphicsElement).getBBox().y
            } catch {
              return 0
            }
          }
          const heads = [...all].sort((a, b) => top(a) - top(b))
          const notes = [...pitched].sort((a, b) => b.sourceNote.Pitch.getHalfTone() - a.sourceNote.Pitch.getHalfTone())
          notes.forEach((gn, k) => {
            const n = gn.sourceNote
            const own = heads.length === notes.length ? [heads[k]] : heads
            const letter = LETTER[n.Pitch.FundamentalNote as number] ?? "G"
            if (own.length) out.push({ start, end: start + n.Length.RealValue * 4, voice, heads: own, letter, hollow: n.Length.RealValue >= 0.5 })
          })
        }
      }
    })
  }
  return out
}

const LETTER: Record<number, string> = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" }
const SVG_NS = "http://www.w3.org/2000/svg"

// Each notehead's shape, drawn beside it (OSMD's head is a <path>, which can't hold another).
const shapeOfHead = new WeakMap<SVGElement, SVGPathElement>()

/** Swap a notehead for its shape (or back to OSMD's round head when `fifths` is null). */
function setShape(head: SVGElement, n: DrawnNote, fifths: number | null, ink: string) {
  shapeOfHead.get(head)?.remove()
  shapeOfHead.delete(head)
  head.style.visibility = ""
  if (fifths === null) return
  let box: DOMRect
  try {
    box = (head as unknown as SVGGraphicsElement).getBBox()
  } catch {
    return
  }
  if (!box.width || !box.height) return
  const shape = shapeOf(`${n.letter}4`, fifths)
  const up = n.voice === "soprano" || n.voice === "tenor"
  const d = shapePath(shape, box.x + box.width / 2, box.y + box.height / 2, box.width * 1.05, box.height * (shape === "sol" ? 1 : 1.05), up)
  if (!d) return // sol: OSMD's oval is already right
  const path = document.createElementNS(SVG_NS, "path")
  path.setAttribute("d", d)
  path.setAttribute("fill", n.hollow ? "none" : ink)
  path.setAttribute("stroke", ink)
  path.setAttribute("stroke-width", String(Math.max(0.8, box.height * 0.13)))
  path.setAttribute("stroke-linejoin", "round")
  path.dataset.shape = "1"
  if (n.hollow) path.dataset.hollow = "1"
  // (copy the head's own transform, if any, so the shape lands where the head was drawn)
  const tf = head.getAttribute("transform")
  if (tf) path.setAttribute("transform", tf)
  head.after(path)
  head.style.visibility = "hidden"
  shapeOfHead.set(head, path)
}

/** Fill and outline a notehead in `color`, or back to the score's own ink (null). */
function paint(head: SVGElement, color: string | null) {
  const shape = shapeOfHead.get(head)
  for (const el of [head, ...Array.from(head.querySelectorAll<SVGElement>("path, ellipse, circle, polygon")), ...(shape ? [shape] : [])]) {
    if (!el.dataset.hollow) el.style.fill = color ?? ""
    el.style.stroke = color ?? ""
  }
}
