import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { Sound } from "@/lib/tone"
import { useT } from "@/hooks/use-locale"

const KEY = "practice-sound"
const read = (): Sound => {
  try {
    return localStorage.getItem(KEY) === "tone" ? "tone" : "piano"
  } catch {
    return "piano"
  }
}

/** Piano or "just notes" (plain tone), remembered between sessions and shared by every screen. */
export function useSound(): [Sound, (s: Sound) => void] {
  const [sound, setSound] = useState<Sound>(read)
  useEffect(() => {
    const on = () => setSound(read())
    window.addEventListener("practice-sound", on)
    return () => window.removeEventListener("practice-sound", on)
  }, [])
  return [
    sound,
    (s) => {
      try {
        localStorage.setItem(KEY, s)
      } catch {}
      setSound(s)
      window.dispatchEvent(new Event("practice-sound"))
    },
  ]
}

export function SoundSwitch({ sound, onChange }: { sound: Sound; onChange: (s: Sound) => void }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("sound.label")}</span>
      <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={t("sound.label")}>
        {([["piano", t("sound.piano")], ["tone", t("sound.tone")]] as const).map(([v, label]) => (
          <button
            key={v}
            role="radio"
            aria-checked={sound === v}
            onClick={() => onChange(v)}
            className={cn("rounded-md px-3 py-1", sound === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
