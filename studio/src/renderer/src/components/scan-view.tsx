import { Maximize, Minus, Plus } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Box, Head } from "@/lib/studio"
import { useT } from "@/hooks/use-locale"
import { cn } from "@/lib/utils"

type View = { s: number; x: number; y: number }

type Props = {
  src: string
  alt: string
  size: [number, number]
  heads: Head[]
  showOk: boolean
  /** The selected measure's box (shaded) */
  measure?: Box | null
  /** The selected note's box (ringed and labelled) */
  note?: Box | null
  label?: string
  /** Bumped each time the note sounds, to pulse the ring */
  pulse?: number
  /** Zoom to the note (or the measure) whenever the selection changes */
  follow: boolean
  /** Changes when the selection changes, to re-run "follow" */
  focusKey?: string
}

const MAX = 8

/**
 * The page image with the detected noteheads drawn on top, zoomable and pannable:
 * pinch or ⌘/Ctrl + scroll to zoom at the pointer, scroll or drag to pan, buttons to zoom/fit.
 */
export function ScanView({ src, alt, size: [W, H], heads, showOk, measure, note, label, pulse = 0, follow, focusKey }: Props) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [cw, setCw] = useState(0)
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
  const [animate, setAnimate] = useState(false)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)

  const base = cw / W // page px → screen px at scale 1 (page as wide as the frame)
  const full = cw * (H / W)
  // The frame is at most ~45% of the window tall so the note editor stays in view; "fit" shows the whole page.
  const ch = Math.min(full, Math.max(260, (typeof window === "undefined" ? 900 : window.innerHeight) * 0.45))
  const MIN = full ? Math.min(1, ch / full) : 1

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setCw(el.clientWidth))
    ro.observe(el)
    setCw(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Keep the page covering the frame (no empty margins while zoomed).
  const clamp = useCallback(
    (v: View): View => {
      const s = Math.min(MAX, Math.max(MIN, v.s))
      const w = W * base * s
      const h = H * base * s
      const fit = (pos: number, size: number, frame: number) => (size <= frame ? (frame - size) / 2 : Math.min(0, Math.max(frame - size, pos)))
      return { s, x: fit(v.x, w, cw), y: fit(v.y, h, ch) }
    },
    [W, H, base, cw, ch, MIN],
  )

  // Start (and re-fit after a resize or page change) showing the whole page.
  const fitPage = useCallback((smooth = false) => {
    setAnimate(smooth)
    setView(clamp({ s: MIN, x: 0, y: 0 }))
  }, [clamp, MIN])
  useEffect(() => {
    if (!follow || (!note && !measure)) fitPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, cw])

  const zoomAt = (factor: number, px = cw / 2, py = ch / 2, smooth = false) => {
    setAnimate(smooth)
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, v.s * factor))
      const k = s / v.s
      return clamp({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k })
    })
  }

  const focusOn = useCallback(
    (b: Box, smooth = true) => {
      if (!cw) return
      const [x0, y0, x1, y1] = b
      const bw = Math.max(1, x1 - x0) * base
      const bh = Math.max(1, y1 - y0) * base
      const s = Math.min(MAX, Math.max(MIN, Math.min((cw * 0.92) / bw, (ch * 0.9) / bh)))
      const cx = ((x0 + x1) / 2) * base * s
      const cy = ((y0 + y1) / 2) * base * s
      setAnimate(smooth)
      setView(clamp({ s, x: cw / 2 - cx, y: ch / 2 - cy }))
    },
    [cw, ch, base, clamp, MIN],
  )

  // Follow the selection: the note with its measure around it, or the whole measure.
  useEffect(() => {
    if (!follow) return
    if (note && measure) {
      // Note in the middle, about a third of the measure wide, its whole system's height.
      const span = Math.max((measure[2] - measure[0]) / 3, (note[2] - note[0]) * 10)
      const cx = (note[0] + note[2]) / 2
      focusOn([cx - span / 2, measure[1], cx + span / 2, measure[3]])
    } else if (note) focusOn([note[0] - 150, note[1] - 150, note[2] + 150, note[3] + 150])
    else if (measure) focusOn(measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, follow, cw])

  // Wheel: pinch / ⌘-scroll zooms at the pointer; plain scroll pans while zoomed in.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      } else if (view.s > MIN + 0.001) {
        e.preventDefault()
        setAnimate(false)
        setView((v) => clamp({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })

  const k = base * view.s // page px → screen px now
  const sw = (px: number) => px / k // a stroke `px` screen pixels wide, in page units

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={box}
        className={cn("relative overflow-hidden rounded-md border bg-white select-none", view.s > MIN + 0.001 && "cursor-grab active:cursor-grabbing")}
        style={{ height: ch || undefined }}
        onPointerDown={(e) => {
          if (view.s <= MIN + 0.001) return
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setAnimate(false)
          setView(clamp({ s: view.s, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }))
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          zoomAt(view.s > 2.5 ? MIN / view.s : 2, e.clientX - r.left, e.clientY - r.top, true)
        }}
      >
        {/* The scan stays white in dark mode (it's paper); only the frame follows the theme. */}
        <div
          className={cn("absolute top-0 left-0 origin-top-left", animate && "transition-transform duration-300 ease-out")}
          style={{ width: cw, height: full, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        >
          <img src={src} alt={alt} draggable={false} className="block size-full" />
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
            {measure && (
              <rect x={measure[0]} y={measure[1]} width={measure[2] - measure[0]} height={measure[3] - measure[1]} fill="#0ea5e9" fillOpacity={0.07} stroke="#0ea5e9" strokeOpacity={0.6} strokeWidth={sw(1.5)} strokeDasharray={`${sw(6)} ${sw(4)}`} rx={sw(4)} />
            )}
            {heads.filter((h) => showOk || !h.ok).map((h, i) => (
              <g key={i}>
                <rect x={h.x0 - 3} y={h.y0 - 3} width={h.x1 - h.x0 + 6} height={h.y1 - h.y0 + 6} fill="none" stroke={h.ok ? "#dc2626" : "#c026d3"} strokeOpacity={note ? 0.45 : 1} strokeWidth={sw(h.ok ? 1 : 2)} rx={3} />
                {!h.ok && <text x={h.x0} y={h.y1 + sw(14)} fill="#c026d3" fontSize={sw(12)} fontWeight={600}>{h.pitch}?</text>}
              </g>
            ))}
            {note && (
              <g>
                <circle key={pulse} cx={(note[0] + note[2]) / 2} cy={(note[1] + note[3]) / 2} r={sw(10)} fill="#0ea5e9" fillOpacity={0.35}>
                  <animate attributeName="r" from={sw(8)} to={sw(34)} dur="0.7s" fill="freeze" />
                  <animate attributeName="fill-opacity" from="0.45" to="0" dur="0.7s" fill="freeze" />
                </circle>
                <rect x={note[0] - sw(5)} y={note[1] - sw(5)} width={note[2] - note[0] + sw(10)} height={note[3] - note[1] + sw(10)} fill="#0ea5e9" fillOpacity={0.15} stroke="#0284c7" strokeWidth={sw(2.5)} rx={sw(5)} />
              </g>
            )}
          </svg>
        </div>
        {note && label && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-sky-600 px-2 py-0.5 text-xs font-medium text-white shadow"
            style={{ left: view.x + ((note[0] + note[2]) / 2) * k, top: view.y + note[1] * k, transition: animate ? "left 300ms ease-out, top 300ms ease-out" : undefined }}
          >
            ♪ {label}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="icon-sm" variant="outline" onClick={() => zoomAt(1 / 1.5, undefined, undefined, true)} disabled={view.s <= MIN} aria-label={t("scan.zoomOut")}><Minus /></Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round((view.s / MIN) * 100)}%</span>
        <Button size="icon-sm" variant="outline" onClick={() => zoomAt(1.5, undefined, undefined, true)} disabled={view.s >= MAX} aria-label={t("scan.zoomIn")}><Plus /></Button>
        <Button size="sm" variant="ghost" onClick={() => fitPage(true)} disabled={view.s <= MIN + 0.001}><Maximize /> {t("scan.fit")}</Button>
        <span className="ml-2 text-xs text-muted-foreground">{t("scan.help")}</span>
      </div>
    </div>
  )
}
