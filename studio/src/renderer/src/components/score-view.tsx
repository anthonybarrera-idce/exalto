import { OpenSheetMusicDisplay } from "opensheetmusicdisplay"
import { useEffect, useRef, useState } from "react"
import { usePressHold } from "@/hooks/use-press-hold"
import { useTheme } from "@/hooks/use-theme"
import { useLocale } from "@/hooks/use-locale"
import type { HeldTone } from "@/lib/tone"

/** What was clicked: the beat (for seeking) and the single note under the pointer (for auditioning). */
export type ScoreHit = {
  beat: number
  note?: { frequency: number; quarters: number; staff: number; name: string; voice: string }
}
type Flash = { x: number; y: number; label: string; key: number; ms: number; held?: boolean }

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
}

const ACCENT = "#0ea5e9"

/** Renders the score with OpenSheetMusicDisplay and moves a note cursor and a measure shade to `beat`. */
export function ScoreView({ xml, beat, onHit, hint }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const osmd = useRef<OpenSheetMusicDisplay | null>(null)
  const steps = useRef<number[]>([])
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
      followCursor: true,
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
    osmd.current = o
    return () => {
      o.clear()
      osmd.current = null
    }
  }, [resolved])

  // (Re)load whenever the MusicXML changes; keep where the user had scrolled to.
  useEffect(() => {
    const o = osmd.current
    if (!o || !xml) return
    let cancelled = false
    const scroller = host.current?.closest(".overflow-y-auto") as HTMLElement | null
    const keep = scroller?.scrollTop ?? 0
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
        at.current = 0
        o.cursors.forEach((k) => (k.reset(), k.show()))
        if (scroller) scroller.scrollTop = keep
        setError(null)
        setReady((r) => r + 1)
      } catch (e) {
        setError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [xml, resolved])

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
  }, [beat, ready])

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
    <div ref={wrap} className="relative w-full">
      <div
        ref={host}
        onPointerDown={onPointerDown}
        onPointerUp={hold.release}
        onPointerCancel={hold.release}
        onLostPointerCapture={hold.release}
        onPointerLeave={hold.release}
        className={onHit ? "w-full cursor-pointer" : "w-full"} aria-label={t("score.label")} title={hint} />
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
