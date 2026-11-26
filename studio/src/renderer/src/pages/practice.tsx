import { Pause, Play } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Empty, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { useStudio } from "@/hooks/use-studio"
import { asset, studio, type Measure } from "@/lib/studio"
import { ScoreView } from "@/components/score-view"
import { startTone } from "@/lib/tone"
import { createMixer, type Mixer } from "@/lib/mixer"
import { SoundSwitch, useSound } from "@/hooks/use-sound"
import { cn } from "@/lib/utils"
import { useLocale } from "@/hooks/use-locale"
import type { StringKey } from "@/lib/i18n"

const TRACKS = [
  { id: "soprano", sub: "practice.subSoprano" },
  { id: "alto", sub: "practice.subAlto" },
  { id: "tenor", sub: "practice.subTenor" },
  { id: "bass", sub: "practice.subBass" },
] as const
type Voice = (typeof TRACKS)[number]["id"]
/** Same voice colors as the mobile app's practice screen (exalto/src/components/practice/ScoreView.tsx). */
const VOICE_COLOR: Record<Voice, string> = { soprano: "#04C1FF", alto: "#C9801C", tenor: "#3E9F6B", bass: "#7B63D6" }
const PRESETS: [StringKey, Record<Voice, number>][] = [
  ["preset.quartet", { soprano: 100, alto: 100, tenor: 100, bass: 100 }],
  ["preset.sopranoOnly", { soprano: 100, alto: 0, tenor: 0, bass: 0 }],
  ["preset.altoOnly", { soprano: 0, alto: 100, tenor: 0, bass: 0 }],
  ["preset.tenorOnly", { soprano: 0, alto: 0, tenor: 100, bass: 0 }],
  ["preset.bassOnly", { soprano: 0, alto: 0, tenor: 0, bass: 100 }],
  ["preset.upperVoices", { soprano: 100, alto: 100, tenor: 0, bass: 0 }],
  ["preset.lowerVoices", { soprano: 0, alto: 0, tenor: 100, bass: 100 }],
  ["preset.practiceAlto", { soprano: 25, alto: 100, tenor: 25, bass: 25 }],
]
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** Plays the four voice tracks in sync; each voice can be checked on or off and has its own volume. */
export function PracticePage() {
  const { detail } = useStudio()
  const { t, voiceName } = useLocale()
  const audio = useRef<Record<Voice, HTMLAudioElement | null>>({ soprano: null, alto: null, tenor: null, bass: null })
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [vol, setVol] = useState<Record<Voice, number>>(PRESETS[0][1])
  // Checked voices play: any combination (e.g. soprano + alto).
  const ALL: Voice[] = TRACKS.map((t) => t.id)
  const [on, setOn] = useState<Set<Voice>>(new Set(ALL))
  const [bpm, setBpm] = useState(80)
  const [clickMode, setClickMode] = useState<"play" | "note">("play")
  // Shape notes (do triangle, re half-moon…) or round heads; remembered on this computer.
  const [shapes, setShapesState] = useState(() => {
    try {
      return localStorage.getItem("studio.shapeNotes") === "1"
    } catch {
      return false
    }
  })
  const setShapes = (on: boolean) => {
    setShapesState(on)
    try {
      localStorage.setItem("studio.shapeNotes", on ? "1" : "0")
    } catch {
      // private storage unavailable: just this session
    }
  }
  const [sound, setSound] = useSound()
  const [tonesReady, setTonesReady] = useState(false)
  // When the sound changes mid-song, pick up at the same spot in the new tracks.
  const resume = useRef<{ t: number; play: boolean } | null>(null)
  useEffect(() => {
    if (!detail || sound !== "tone" || detail.review.kind === "lyrics") return
    setTonesReady(false)
    studio.ensureTones(detail.slug).then(() => setTonesReady(true)).catch(() => setTonesReady(false))
  }, [detail?.slug, sound])
  const track = sound === "tone" && tonesReady ? "tone" : "piano"
  // (the app's own playhead: the audio element has already reset by the time effects run)
  useEffect(() => {
    resume.current = { t: time, play: playing }
  }, [track]) // eslint-disable-line react-hooks/exhaustive-deps
  const [xml, setXml] = useState<string | null>(null)
  useEffect(() => {
    setXml(null)
    if (detail) studio.readText(detail.slug, `${detail.slug}.musicxml`).then(setXml)
  }, [detail?.slug, detail?.transcription])
  const base = detail?.review.bpm ?? 80

  useEffect(() => setBpm(base), [base, detail?.slug])
  const mixer = useRef<Mixer | null>(null)
  const levels = () =>
    Object.fromEntries(TRACKS.map((t) => [t.id, (on.has(t.id) ? 1 : 0) * (vol[t.id] / 100)]))
  // Created on the first Play (browsers only start audio after a click), then reused.
  const ensureMixer = async () => {
    if (!mixer.current) {
      mixer.current = createMixer()
      ;(window as unknown as { studioMixer?: Mixer }).studioMixer = mixer.current // for checks
      for (const t of TRACKS) {
        const a = audio.current[t.id]
        if (a) mixer.current.connect(t.id, a)
      }
    }
    await mixer.current.resume()
    mixer.current.set(levels())
  }
  useEffect(() => {
    mixer.current?.set(levels())
    for (const t of TRACKS) {
      const a = audio.current[t.id]
      if (!a) continue
      a.volume = 1 // levels are applied in the mixer, which can go above 100%
      a.playbackRate = bpm / base
    }
  }, [vol, on, bpm, base]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPlaying(false)
    setTime(0)
  }, [detail?.slug])
  // Track the playhead every frame while playing, so the score cursor keeps up with eighth notes.
  useEffect(() => {
    if (!playing) return
    let id = 0
    const tick = () => {
      const a = audio.current.soprano
      if (a) setTime(a.currentTime)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing])
  if (!detail) return <Empty>{t("common.convertFirst")}</Empty>
  if (detail.review.kind === "lyrics") return <Empty>{t("practice.lyricsOnly")}</Empty>

  const els = () => TRACKS.map((t) => audio.current[t.id]).filter(Boolean) as HTMLAudioElement[]
  const toggle = async () => {
    if (playing) els().forEach((a) => a.pause())
    else {
      await ensureMixer()
      const t0 = els()[0]?.currentTime ?? 0
      els().forEach((a) => (a.currentTime = t0))
      await Promise.all(els().map((a) => a.play()))
    }
    setPlaying(!playing)
  }
  const seek = (t: number) => {
    els().forEach((a) => (a.currentTime = t))
    setTime(t)
  }
  // Jump to a spot and keep (or start) playing from there.
  const playFrom = async (t: number) => {
    seek(t)
    if (!playing) {
      await ensureMixer()
      await Promise.all(els().map((a) => a.play()))
      setPlaying(true)
    }
  }
  // Measure lengths come from the score (pickups and page-split measures included);
  // streamed audio doesn't report a duration.
  const [num, den] = (detail.transcription.pages[0]?.time_signature ?? "4/4").split("/").map(Number)
  const starts = measureStarts(detail.transcription.pages.flatMap((p) => p.measures), (num * 4) / den || 4)
  const measures = starts.length - 1
  const secPerBeat = 60 / base
  const duration = starts[measures] * secPerBeat
  const beat = time / secPerBeat
  const current = Math.max(1, Math.min(measures, starts.findIndex((b) => b > beat + 1e-6)))

  return (
    <>
      <PageHeader title={t("practice.title")} sub={t("practice.sub")} badge={<Badge variant="secondary">{sound === "tone" ? t("sound.tone") : t("practice.builtInPiano")}</Badge>} />
      {TRACKS.map((t) => (
        <audio
          key={t.id}
          ref={(el) => {
            audio.current[t.id] = el
          }}
          crossOrigin="anonymous"
          src={asset(detail.slug, `${detail.slug}-${track}-${t.id}.wav`)}
          preload="auto"
          onLoadedMetadata={(e) => {
            const r = resume.current
            if (!r) return
            e.currentTarget.currentTime = r.t
            if (r.play) e.currentTarget.play()
            if (t.id === "bass") resume.current = null
          }}
          onTimeUpdate={(e) => t.id === "soprano" && setTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      ))}

      <Card className="flex-row items-center gap-4 px-5 py-3.5">
        <Button size="icon" className="size-11 rounded-full" onClick={toggle} aria-label={playing ? t("practice.pause") : t("practice.play")}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="w-32">
          <div className="text-[15px] font-semibold tabular-nums">{fmt(time)} / {fmt(duration / (bpm / base))}</div>
          <div className="text-xs text-muted-foreground">{t("practice.measureOf", { n: current, total: measures })}</div>
        </div>
        <div className="flex flex-1 gap-0.75">
          {Array.from({ length: measures }, (_, i) => (
            <button
              key={i}
              onClick={() => seek(starts[i] * secPerBeat)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center rounded text-[10px] font-medium",
                i + 1 < current ? "bg-primary text-primary-foreground" : i + 1 === current ? "bg-primary/70 text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-2 py-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setBpm(Math.max(30, bpm - 5))} aria-label={t("practice.slower")}>−</Button>
          <span className="w-16 text-center text-sm font-medium tabular-nums">{bpm} BPM</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setBpm(Math.min(200, bpm + 5))} aria-label={t("practice.faster")}>+</Button>
        </div>
      </Card>

      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("practice.quickMix")}</span>
        {PRESETS.map(([name, v]) => {
          // A preset checks the voices it uses (others unchecked) and sets their volumes.
          const picks = ALL.filter((id) => v[id] > 0)
          const active = ALL.every((id) => on.has(id) === v[id] > 0 && (v[id] === 0 || vol[id] === v[id]))
          return (
            <button
              key={name}
              onClick={() => (setOn(new Set(picks)), setVol(Object.fromEntries(ALL.map((id) => [id, v[id] || vol[id] || 100])) as Record<Voice, number>))}
              className={cn("rounded-full px-3 py-1.5 text-sm font-medium", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {t(name)}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
      <SoundSwitch sound={sound} onChange={setSound} />
      {sound === "tone" && !tonesReady && <span className="text-xs text-muted-foreground">{t("practice.preparing")}</span>}
      <label className="flex w-fit items-center gap-2 text-sm">
        <Switch checked={shapes} onCheckedChange={setShapes} />
        {t("practice.shapeNotes")}
      </label>
      <label className="flex w-fit items-center gap-2 text-sm">
        <Switch checked={clickMode === "note"} onCheckedChange={(on) => setClickMode(on ? "note" : "play")} />
        {t("practice.oneNote")}
        <span className="text-muted-foreground">
          {clickMode === "note" ? t("practice.oneNoteOn") : t("practice.oneNoteOff")}
        </span>
      </label>
      </div>
      <Card className="mb-4 gap-0 overflow-x-auto overflow-y-hidden bg-card p-3">
        <ScoreView
          horizontal
          follow={false}
          followPlayhead={playing}
          shapesFifths={shapes ? (detail.review.key_fifths ?? 0) : null}
          xml={xml}
          beat={(time * base) / 60}
          voiceColors={playing ? Object.fromEntries(ALL.filter((id) => on.has(id) && vol[id] > 0).map((id) => [id, VOICE_COLOR[id]])) : undefined}
          hint={clickMode === "play" ? t("practice.hintPlay") : t("practice.hintNote")}
          onHit={(hit) => {
            if (clickMode === "note") {
              if (!hit.note) return
              const secs = Math.min(2.5, Math.max(0.35, (hit.note.quarters * 60) / bpm))
              return startTone([hit.note.frequency], secs, sound)
            }
            playFrom(hit.beat * secPerBeat)
          }}
        />
      </Card>

      <Card className="gap-0 py-1.5">
        {TRACKS.map((tr) => (
          <div key={tr.id} className={cn("flex items-center gap-4 border-t px-5 py-3 transition-opacity first:border-t-0", !on.has(tr.id) && "opacity-50")}>
            <label className="flex w-44 cursor-pointer items-center gap-3">
              <Checkbox
                checked={on.has(tr.id)}
                onCheckedChange={(c) => setOn((s) => { const n = new Set(s); c ? n.add(tr.id) : n.delete(tr.id); return n })}
                aria-label={t("practice.hearVoice", { voice: voiceName(tr.id) })}
                style={{ "--voice": VOICE_COLOR[tr.id] } as CSSProperties}
                className="size-5 border-2 border-(--voice) data-checked:border-(--voice) data-checked:bg-(--voice) data-checked:text-white dark:data-checked:bg-(--voice)"
              />
              <div>
                <div className="text-sm font-medium" style={{ color: on.has(tr.id) ? VOICE_COLOR[tr.id] : undefined }}>{voiceName(tr.id)}</div>
                <div className="text-xs text-muted-foreground">{t(tr.sub)}</div>
              </div>
            </label>
            <Slider className="flex-1 [&_[data-slot=slider-range]]:bg-(--voice)" style={{ "--voice": VOICE_COLOR[tr.id] } as CSSProperties} value={[vol[tr.id]]} max={100} step={5} onValueChange={([v]) => setVol({ ...vol, [tr.id]: v })} aria-label={t("practice.volume", { voice: voiceName(tr.id) })} />
            <span className="w-10 text-right text-sm font-medium tabular-nums text-muted-foreground">{vol[tr.id]}%</span>
          </div>
        ))}
      </Card>
    </>
  )
}

/** Beat where each measure starts (plus the end), rejoining a measure split across pages. */
function measureStarts(ms: Measure[], bar: number): number[] {
  const len = (m: Measure) => m.soprano.reduce((a, n) => a + n.dur, 0)
  const out = [0]
  for (let i = 0; i < ms.length; i++) {
    let l = len(ms[i])
    if (i > 0 && l < bar && ms[i + 1] && Math.abs(l + len(ms[i + 1]) - bar) < 1e-6) l += len(ms[++i])
    out.push(out[out.length - 1] + l)
  }
  return out
}
