import { Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Empty, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
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
  { id: "soprano", sub: "practice.subSoprano", color: "bg-rose-500" },
  { id: "alto", sub: "practice.subAlto", color: "bg-amber-500" },
  { id: "tenor", sub: "practice.subTenor", color: "bg-emerald-500" },
  { id: "bass", sub: "practice.subBass", color: "bg-blue-500" },
] as const
type Voice = (typeof TRACKS)[number]["id"]
const PRESETS: [StringKey, Record<Voice, number>][] = [
  ["preset.quartet", { soprano: 100, alto: 100, tenor: 100, bass: 100 }],
  ["preset.sopranoOnly", { soprano: 100, alto: 0, tenor: 0, bass: 0 }],
  ["preset.altoOnly", { soprano: 0, alto: 100, tenor: 0, bass: 0 }],
  ["preset.tenorOnly", { soprano: 0, alto: 0, tenor: 100, bass: 0 }],
  ["preset.bassOnly", { soprano: 0, alto: 0, tenor: 0, bass: 100 }],
  ["preset.practiceAlto", { soprano: 25, alto: 100, tenor: 25, bass: 25 }],
]
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** Plays the four voice tracks in sync; volume, solo and mute are per voice. */
export function PracticePage() {
  const { detail } = useStudio()
  const { t, voiceName } = useLocale()
  const audio = useRef<Record<Voice, HTMLAudioElement | null>>({ soprano: null, alto: null, tenor: null, bass: null })
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [vol, setVol] = useState<Record<Voice, number>>(PRESETS[0][1])
  const [solo, setSolo] = useState<Voice | null>(null)
  const [muted, setMuted] = useState<Set<Voice>>(new Set())
  const [bpm, setBpm] = useState(80)
  const [clickMode, setClickMode] = useState<"play" | "note">("play")
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
    Object.fromEntries(TRACKS.map((t) => [t.id, (solo ? (solo === t.id ? 1 : 0) : muted.has(t.id) ? 0 : 1) * (vol[t.id] / 100)]))
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
  }, [vol, solo, muted, bpm, base]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const starts = measureStarts(detail.transcription.pages.flatMap((p) => p.measures))
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
          const on = TRACKS.every((t) => vol[t.id] === v[t.id]) && !solo && !muted.size
          return (
            <button key={name} onClick={() => (setVol(v), setSolo(null), setMuted(new Set()))} className={cn("rounded-full px-3 py-1.5 text-sm font-medium", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
              {t(name)}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
      <SoundSwitch sound={sound} onChange={setSound} />
      {sound === "tone" && !tonesReady && <span className="text-xs text-muted-foreground">{t("practice.preparing")}</span>}
      <label className="flex w-fit items-center gap-2 text-sm">
        <Switch checked={clickMode === "note"} onCheckedChange={(on) => setClickMode(on ? "note" : "play")} />
        {t("practice.oneNote")}
        <span className="text-muted-foreground">
          {clickMode === "note" ? t("practice.oneNoteOn") : t("practice.oneNoteOff")}
        </span>
      </label>
      </div>
      <Card className="mb-4 max-h-[420px] gap-0 overflow-y-auto bg-card p-3">
        <ScoreView
          xml={xml}
          beat={(time * base) / 60}
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
          <div key={tr.id} className="flex items-center gap-4 border-t px-5 py-3 first:border-t-0">
            <span className={cn("size-2.5 rounded-full", tr.color)} />
            <div className="w-36">
              <div className="text-sm font-medium">{voiceName(tr.id)}</div>
              <div className="text-xs text-muted-foreground">{t(tr.sub)}</div>
            </div>
            <Toggle on={solo === tr.id} onClick={() => setSolo(solo === tr.id ? null : tr.id)} label={t("practice.soloShort")} title={t("practice.solo")} />
            <Toggle on={muted.has(tr.id)} onClick={() => setMuted((m) => { const n = new Set(m); n.has(tr.id) ? n.delete(tr.id) : n.add(tr.id); return n })} label={t("practice.muteShort")} title={t("practice.mute")} />
            <Slider className="flex-1" value={[vol[tr.id]]} max={100} step={5} onValueChange={([v]) => setVol({ ...vol, [tr.id]: v })} aria-label={t("practice.volume", { voice: voiceName(tr.id) })} />
            <span className="w-10 text-right text-sm font-medium tabular-nums text-muted-foreground">{vol[tr.id]}%</span>
          </div>
        ))}
      </Card>
    </>
  )
}

function Toggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button title={title} aria-pressed={on} onClick={onClick} className={cn("size-7 rounded-md border text-xs font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
      {label}
    </button>
  )
}

/** Beat where each measure starts (plus the end), rejoining a measure split across pages. */
function measureStarts(ms: Measure[]): number[] {
  const len = (m: Measure) => m.soprano.reduce((a, n) => a + n.dur, 0)
  const out = [0]
  for (let i = 0; i < ms.length; i++) {
    let l = len(ms[i])
    if (i > 0 && l < 4 && ms[i + 1] && l + len(ms[i + 1]) === 4) l += len(ms[++i])
    out.push(out[out.length - 1] + l)
  }
  return out
}
