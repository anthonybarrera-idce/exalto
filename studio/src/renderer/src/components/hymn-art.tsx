import exaltoMark from "@/assets/exalto-mark.svg"
import { useAllHymnals } from "@/lib/hymnals"
import { cn } from "@/lib/utils"

/**
 * Hymn artwork, as the mobile app draws it (exalto/src/components/ui/hymn-art.tsx): the hymnal's thumbnail
 * image if it has one, otherwise an analogous gradient of the hymnal's color with the Exalto mark on top.
 * Size and rounding come from `className`.
 */
export function HymnArt({
  hymnalId,
  thumbnailUrl,
  color,
  label,
  className,
}: {
  hymnalId?: string
  /** Override the hymnal's (e.g. a dialog previewing an unsaved color). */
  thumbnailUrl?: string
  color?: string
  /** Hymn number; the mark turns into a faint watermark behind it. */
  label?: string
  className?: string
}) {
  const hymnal = useAllHymnals().find((h) => h.id === hymnalId)
  const url = thumbnailUrl ?? hymnal?.thumbnailUrl
  const bg = hymnalGradient(color ?? hymnal?.color ?? "#4A2E6B")
  return (
    <div aria-hidden className={cn("relative flex shrink-0 items-center justify-center overflow-hidden [container-type:size]", className)} style={{ background: bg }}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <img src={exaltoMark} alt="" className={cn("h-[48%] brightness-0 invert", label != null ? "opacity-20" : "opacity-70")} />
      )}
      {label != null && (
        <span className={cn("absolute font-extrabold text-white/90", url && "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]")} style={{ fontSize: "clamp(11px, 30cqw, 40px)" }}>
          {label}
        </span>
      )}
    </div>
  )
}

/** Same formula as the app: the color nudged 12° back and lifted, to its neighbour 40° round the wheel, a bit deeper. */
export function hymnalGradient(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0 : (((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360
  const sat = s < 0.08 ? s : Math.max(s, 0.45)
  const pct = (x: number) => `${Math.round(Math.min(1, Math.max(0, x)) * 100)}%`
  return `linear-gradient(135deg, hsl(${h - 12} ${pct(sat)} ${pct(Math.max(l + 0.08, 0.32))}), hsl(${h + 40} ${pct(sat * 1.05)} ${pct(Math.min(l - 0.06, 0.4))}))`
}
