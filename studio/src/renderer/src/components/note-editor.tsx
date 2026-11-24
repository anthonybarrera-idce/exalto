import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Link2, Plus, Trash2, Volume2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePressHold } from "@/hooks/use-press-hold"
import { useLocale } from "@/hooks/use-locale"
import {
  beats,
  DURATIONS,
  durShort,
  frequency,
  isRest,
  near,
  normalizePitch,
  octavePitch,
  parsePitch,
  setAccidental,
  stepPitch,
  VOICES,
  type Bar,
  type Voice,
} from "@/lib/notes"
import type { Note, Page } from "@/lib/studio"
import { startTone, type Sound } from "@/lib/tone"
import { cn } from "@/lib/utils"

/** Which note is selected: piece of the bar (0, or 1 when it continues on the next line), voice, index. */
export type Sel = { piece: number; voice: Voice; i: number }

type Props = {
  pages: Page[]
  bar: Bar
  number: number
  barLen: number
  /** The bar is fine as it is (e.g. a pickup), even if it doesn't fill the meter */
  barOk?: boolean
  fifths: number
  bpm: number
  sound: Sound
  sel: Sel | null
  onSelect: (s: Sel | null) => void
  /** Called whenever a note sounds (to show it on the page) */
  onPlayed?: () => void
  /** Apply a change to the draft (the caller records it for undo). */
  onChange: (mutate: (pages: Page[]) => void) => void
}

const DEFAULT: Record<Voice, string> = { soprano: "C5", alto: "G4", tenor: "E4", bass: "C3" }

/** Edit one measure: four voice rows of notes; select one to change pitch/length, add, rest, tie or delete it. */
export function NoteEditor({ pages, bar, number, barLen, barOk, fifths, bpm, sound, sel, onSelect, onChange, onPlayed }: Props) {
  const { t, num, noteName, durName, voiceName } = useLocale()
  const measureOf = (piece: number) => pages[bar.pieces[piece].pi].measures[bar.pieces[piece].mi]
  const note = sel ? measureOf(sel.piece)?.[sel.voice][sel.i] : undefined
  const play = (n?: Note) => {
    const f = n && !isRest(n.pitch) ? frequency(n.pitch) : null
    const tone = f ? startTone([f], Math.min(2, (n!.dur * 60) / bpm), sound) : null
    onPlayed?.()
    return tone
  }
  // Press and hold a note chip, or the P key, to keep the note sounding until release.
  const chipHold = usePressHold()
  const keyHold = usePressHold()

  // Change the selected note (and hear it)
  const edit = (fn: (n: Note) => void, audition = true) => {
    if (!sel || !note) return
    onChange((ps) => {
      const p = bar.pieces[sel.piece]
      const n = ps[p.pi].measures[p.mi][sel.voice][sel.i]
      if (n) fn(n)
    })
    // The draft updates on the next render; hear the result now from a copy.
    const after = { ...note }
    fn(after)
    if (audition) play(after)
  }
  const insert = (where: "before" | "after" | "end", voice: Voice = sel?.voice ?? "soprano", piece = sel?.piece ?? bar.pieces.length - 1) => {
    const src = where !== "end" && note ? note : undefined
    const fresh: Note = { pitch: src?.pitch ?? lastPitch(voice, piece), dur: src?.dur ?? 1, tie: null, syllable: null, syllabic: null }
    const notes = measureOf(piece)[voice]
    const i = where === "before" ? sel!.i : where === "after" ? sel!.i + 1 : notes.length
    onChange((ps) => {
      const p = bar.pieces[piece]
      ps[p.pi].measures[p.mi][voice].splice(i, 0, fresh)
    })
    onSelect({ piece, voice, i })
    play(fresh)
  }
  const lastPitch = (voice: Voice, piece: number) => {
    const ns = measureOf(piece)[voice].filter((n) => !isRest(n.pitch))
    return ns[ns.length - 1]?.pitch ?? DEFAULT[voice]
  }
  const remove = () => {
    if (!sel) return
    onChange((ps) => {
      const p = bar.pieces[sel.piece]
      ps[p.pi].measures[p.mi][sel.voice].splice(sel.i, 1)
    })
    const left = measureOf(sel.piece)[sel.voice].length - 1
    onSelect(left > 0 ? { ...sel, i: Math.min(sel.i, left - 1) } : null)
  }
  const move = (d: 1 | -1) => {
    if (!sel) return
    const len = measureOf(sel.piece)[sel.voice].length
    const i = sel.i + d
    if (i >= 0 && i < len) return onSelect({ ...sel, i })
    const piece = sel.piece + d
    if (piece >= 0 && piece < bar.pieces.length) {
      const n = measureOf(piece)[sel.voice].length
      if (n) onSelect({ piece, voice: sel.voice, i: d > 0 ? 0 : n - 1 })
    }
  }

  // Keyboard: ↑/↓ scale step (⇧ octave), ←/→ previous/next note, ⌫ delete, R rest, P play.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (!sel || t.closest("input, textarea, [role=combobox], [contenteditable]") || e.metaKey || e.ctrlKey) return
      const rest = note && isRest(note.pitch)
      if (e.key === "ArrowUp" && !rest) edit((n) => (n.pitch = e.shiftKey ? octavePitch(n.pitch, 1) : stepPitch(n.pitch, 1, fifths)))
      else if (e.key === "ArrowDown" && !rest) edit((n) => (n.pitch = e.shiftKey ? octavePitch(n.pitch, -1) : stepPitch(n.pitch, -1, fifths)))
      else if (e.key === "ArrowLeft") move(-1)
      else if (e.key === "ArrowRight") move(1)
      else if (e.key === "Backspace" || e.key === "Delete") remove()
      else if (e.key.toLowerCase() === "p") {
        if (!e.repeat) keyHold.press(play(note))
      }
      else if (e.key === "Escape") onSelect(null)
      else return
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => e.key.toLowerCase() === "p" && keyHold.release()
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKeyUp)
    }
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {VOICES.map((voice) => {
          const total = bar.pieces.reduce((a, _, k) => a + beats(measureOf(k)[voice]), 0)
          const ok = near(total, barLen) || (!!barOk && total > 0)
          return (
            <div key={voice} className="flex items-stretch gap-2">
              <div className="w-16 shrink-0 truncate pt-2 text-xs font-medium text-muted-foreground">{voiceName(voice)}</div>
              <div className="flex min-h-11 flex-1 items-stretch gap-1 rounded-md bg-muted/50 p-1">
                {bar.pieces.map((_, piece) => (
                  <div key={piece} className={cn("flex flex-1 items-stretch gap-1", piece > 0 && "border-l-2 border-dashed border-border pl-1")} style={{ flexGrow: beats(measureOf(piece)[voice]) || 0.5 }}>
                    {measureOf(piece)[voice].map((n, i) => {
                      const on = sel?.piece === piece && sel.voice === voice && sel.i === i
                      return (
                        <button
                          key={i}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return
                            e.currentTarget.setPointerCapture(e.pointerId)
                            onSelect({ piece, voice, i })
                            chipHold.press(play(n))
                          }}
                          onPointerUp={chipHold.release}
                          onPointerCancel={chipHold.release}
                          onLostPointerCapture={chipHold.release}
                          onPointerLeave={chipHold.release}
                          onClick={(e) => {
                            // Keyboard activation (Enter/Space); pointer presses are handled above
                            if (e.detail !== 0) return
                            onSelect({ piece, voice, i })
                            play(n)
                          }}
                          style={{ flexGrow: n.dur, flexBasis: 0 }}
                          title={`${noteName(n.pitch)} · ${durName(n.dur)}${n.syllable ? ` · “${n.syllable}”` : ""}`}
                          className={cn(
                            "flex min-w-10 flex-col items-start justify-center rounded px-1.5 py-1 text-left leading-tight",
                            isRest(n.pitch) ? "bg-background/60 text-muted-foreground" : "bg-background shadow-xs",
                            on && "ring-2 ring-sky-500",
                          )}
                        >
                          <span className="text-sm font-semibold">
                            {noteName(n.pitch)}
                            {n.tie === "start" || n.tie === "continue" ? <span className="text-sky-600"> ⁀</span> : null}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{durShort(n.dur)}{n.syllable ? ` · ${n.syllable}` : ""}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
                <button onClick={() => insert("end", voice)} title={t("note.addEnd", { voice: voiceName(voice) })} className="flex w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background">
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className={cn("w-14 shrink-0 pt-2 text-right text-xs font-medium tabular-nums", ok ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>
                {num(total)}/{num(barLen)}
              </div>
            </div>
          )
        })}
      </div>

      {note ? (
        <NoteTools
          key={`${number}-${sel!.piece}-${sel!.voice}-${sel!.i}`}
          note={note}
          fifths={fifths}
          edit={edit}
          insert={insert}
          remove={remove}
          play={() => play(note)}
        />
      ) : (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          {t("note.keysHelp")}
        </div>
      )}
    </div>
  )
}

function NoteTools({
  note,
  fifths,
  edit,
  insert,
  remove,
  play,
}: {
  note: Note
  fifths: number
  edit: (fn: (n: Note) => void, audition?: boolean) => void
  insert: (w: "before" | "after") => void
  remove: () => void
  play: () => void
}) {
  const { t, num, durName } = useLocale()
  const rest = isRest(note.pitch)
  const [text, setText] = useState(rest ? "" : note.pitch)
  useEffect(() => setText(rest ? "" : note.pitch), [note.pitch, rest])
  const acc = parsePitch(note.pitch)?.acc ?? ""
  const tied = note.tie === "start" || note.tie === "continue"
  const commit = () => {
    const p = normalizePitch(text)
    if (p && p !== note.pitch) edit((n) => (n.pitch = p))
    else setText(rest ? "" : note.pitch)
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-xs text-muted-foreground">{t("note.pitch")}</span>
        <Input
          value={text}
          disabled={rest}
          placeholder="—"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-8 w-20 font-mono"
          aria-label={t("note.pitchAria")}
        />
        <Tool label={t("note.stepUp")} disabled={rest} onClick={() => edit((n) => (n.pitch = stepPitch(n.pitch, 1, fifths)))}><ArrowUp /></Tool>
        <Tool label={t("note.stepDown")} disabled={rest} onClick={() => edit((n) => (n.pitch = stepPitch(n.pitch, -1, fifths)))}><ArrowDown /></Tool>
        <Tool label={t("note.octaveUp")} disabled={rest} onClick={() => edit((n) => (n.pitch = octavePitch(n.pitch, 1)))}><ChevronsUp /></Tool>
        <Tool label={t("note.octaveDown")} disabled={rest} onClick={() => edit((n) => (n.pitch = octavePitch(n.pitch, -1)))}><ChevronsDown /></Tool>
        <div className="flex rounded-md border">
          {([["b", "♭", t("note.flat")], ["", "♮", t("note.natural")], ["#", "♯", t("note.sharp")]] as const).map(([a, sym, label]) => (
            <button
              key={label}
              disabled={rest}
              title={label}
              onClick={() => edit((n) => (n.pitch = setAccidental(n.pitch, a)))}
              className={cn("h-8 w-8 text-sm disabled:opacity-40", !rest && acc === a && "bg-accent font-semibold")}
            >
              {sym}
            </button>
          ))}
        </div>
        <Button size="sm" variant={rest ? "secondary" : "outline"} onClick={() => edit((n) => (n.pitch = isRest(n.pitch) ? "C4" : "REST"), false)}>
          {rest ? t("note.makeNote") : t("note.makeRest")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-xs text-muted-foreground">{t("note.length")}</span>
        <div className="flex flex-wrap gap-1">
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              title={t("note.lengthTitle", { name: durName(d.dur), beats: num(d.dur, 3) })}
              onClick={() => edit((n) => (n.dur = d.dur))}
              className={cn("h-8 min-w-9 rounded-md border px-2 text-xs", near(note.dur, d.dur) && "border-sky-500 bg-sky-500/10 font-semibold")}
            >
              {d.short}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-xs text-muted-foreground">{t("note.note")}</span>
        <Button size="sm" variant="outline" onClick={play} disabled={rest}><Volume2 /> {t("note.play")}</Button>
        <Button size="sm" variant={tied ? "secondary" : "outline"} disabled={rest} onClick={() => edit((n) => (n.tie = tied ? null : "start"), false)}>
          <Link2 /> {tied ? t("note.tied") : t("note.tie")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => insert("before")}><Plus /> {t("note.before")}</Button>
        <Button size="sm" variant="outline" onClick={() => insert("after")}><Plus /> {t("note.after")}</Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}><Trash2 /> {t("note.delete")}</Button>
      </div>
      {note.syllable && <div className="text-xs text-muted-foreground">{t("note.sungOn", { syllable: note.syllable })}</div>}
    </div>
  )
}

function Tool({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="outline" onClick={onClick} disabled={disabled} aria-label={label}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
