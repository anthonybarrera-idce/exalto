import { useCallback, useEffect, useRef } from "react"
import type { HeldTone } from "@/lib/tone"

/** A press longer than this is a hold: the note keeps sounding until release. */
export const HOLD_MS = 250

type Press = { tone: HeldTone; timer: number; held: boolean; end?: () => void }

/**
 * Press-and-hold for a note. `press(tone)` on pointerdown/keydown; `release()` on
 * pointerup/pointercancel/keyup. A quick press leaves the note to play its written length;
 * a press held past HOLD_MS sustains it until release. Releases on window blur and unmount.
 */
export function usePressHold() {
  const cur = useRef<Press | null>(null)

  /** Returns true when the press had become a hold. */
  const release = useCallback(() => {
    const p = cur.current
    if (!p) return false
    cur.current = null
    clearTimeout(p.timer)
    if (p.held) {
      p.tone.stop()
      p.end?.()
    }
    return p.held
  }, [])

  const press = useCallback(
    (tone: HeldTone | null | undefined, on?: { hold?: () => void; end?: () => void }) => {
      release()
      if (!tone) return
      const p: Press = { tone, timer: 0, held: false, end: on?.end }
      p.timer = window.setTimeout(() => {
        p.held = true
        tone.hold(() => cur.current === p && release())
        on?.hold?.()
      }, HOLD_MS)
      cur.current = p
    },
    [release],
  )

  useEffect(() => {
    const onBlur = () => release()
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("blur", onBlur)
      release()
    }
  }, [release])

  return { press, release }
}
