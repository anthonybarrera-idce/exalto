import { ArrowLeft, ArrowRight, Loader2, Save, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ScoreView } from "@/components/score-view"
import { withSopranoLyrics } from "@/lib/musicxml"
import { pretty } from "@/lib/notes"
import { startTone } from "@/lib/tone"
import { useSound } from "@/hooks/use-sound"
import { useT } from "@/hooks/use-locale"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { studio, type HymnDetail, type Measure, type Note, type Page } from "@/lib/studio"

type Slot = { page: number; measure: number; index: number; beat: number; note: Note }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const len = (m: Measure) => m.soprano.reduce((a, n) => a + n.dur, 0)

/** Every sung soprano note, in order, with the beat it starts on (same timeline as the score). */
function slots(pages: Page[]): Slot[] {
  const out: Slot[] = []
  const flat = pages.flatMap((p, pi) => p.measures.map((m, mi) => ({ m, pi, mi })))
  let beat = 0
  for (let k = 0; k < flat.length; k++) {
    const { m, pi, mi } = flat[k]
    let t = beat
    m.soprano.forEach((n, i) => {
      if (n.pitch !== "REST") out.push({ page: pi, measure: mi, index: i, beat: t, note: n })
      t += n.dur
    })
    beat += len(m)
  }
  return out
}

/**
 * Click a note on the score, then type its syllable, mark whether the word continues, or shift
 * every syllable from here one note left or right (for when everything after a mistake is off by one).
 */
export function SyllableEditor({ detail, onSaved }: { detail: HymnDetail; onSaved: () => void }) {
  const [pages, setPages] = useState<Page[]>(() => clone(detail.transcription.pages))
  const [sel, setSel] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hear, setHear] = useState(true)
  const [sound] = useSound()
  const t = useT()
  const [baseXml, setBaseXml] = useState<string | null>(null)
  useEffect(() => {
    setPages(clone(detail.transcription.pages))
    setDirty(false)
    setSel(0)
    studio.readText(detail.slug, `${detail.slug}.musicxml`).then(setBaseXml)
  }, [detail.slug, detail.transcription])

  const list = useMemo(() => slots(pages), [pages])
  // Live preview: put the edited syllables into the score as you type (debounced redraw).
  const [liveXml, setLiveXml] = useState<string | null>(null)
  useEffect(() => {
    if (!baseXml) return
    const t = setTimeout(
      () => setLiveXml(withSopranoLyrics(baseXml, list.map((s) => ({ text: s.note.syllable, syllabic: s.note.syllabic })))),
      dirty ? 250 : 0,
    )
    return () => clearTimeout(t)
  }, [baseXml, list, dirty])
  const cur = list[sel]

  const update = (fn: (list: Slot[]) => void) => {
    const next = clone(pages)
    const l = slots(next)
    fn(l)
    setPages(next)
    setDirty(true)
  }
  const setText = (text: string) => update((l) => (l[sel].note.syllable = text || null))
  const setJoins = (joins: boolean) =>
    update((l) => {
      const prevJoins = sel > 0 && ["begin", "middle"].includes(l[sel - 1].note.syllabic ?? "")
      l[sel].note.syllabic = prevJoins ? (joins ? "middle" : "end") : joins ? "begin" : "single"
    })
  // Move every syllable from the selected note onward one note later (+1) or earlier (-1).
  // Later: the selected note becomes empty. Earlier: it replaces the syllable on the note before.
  const shift = (dir: -1 | 1) =>
    update((l) => {
      const start = dir === 1 ? sel : sel - 1
      const vals = l.map((s) => [s.note.syllable ?? null, s.note.syllabic ?? null] as const)
      for (let i = start; i < l.length; i++) {
        const [syl, kind] = vals[i - dir] !== undefined && i - dir >= sel ? vals[i - dir] : [null, null]
        l[i].note.syllable = syl
        l[i].note.syllabic = kind
      }
    })

  const save = async () => {
    setSaving(true)
    try {
      await studio.saveSyllables(detail.slug, pages)
      toast.success(t("syl.saved"))
      setDirty(false)
      onSaved()
    } catch (e) {
      toast.error(t("common.couldNotSave"), { description: String(e).slice(0, 300) })
    } finally {
      setSaving(false)
    }
  }

  const joins = ["begin", "middle"].includes(cur?.note.syllabic ?? "")
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold">{t("syl.title")}</div>
          <div className="text-xs text-muted-foreground">{t("syl.sub")}</div>
        </div>
        <Button variant="outline" disabled={!dirty || saving} onClick={() => (setPages(clone(detail.transcription.pages)), setDirty(false))}>
          {t("common.discard")}
        </Button>
        <Button disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}{t("syl.save")}
        </Button>
      </div>

      {cur && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="syl">
              {t("syl.noteOf", { n: sel + 1, total: list.length, pitch: pretty(cur.note.pitch) })}
            </Label>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" aria-label={t("syl.prev")} disabled={sel === 0} onClick={() => setSel(sel - 1)}><ArrowLeft /></Button>
              <Input
                id="syl"
                className="w-40"
                value={cur.note.syllable ?? ""}
                placeholder={t("syl.held")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab" || e.key === "Enter") {
                    e.preventDefault()
                    setSel(Math.min(list.length - 1, sel + (e.shiftKey ? -1 : 1)))
                  }
                }}
                autoFocus
              />
              <Button variant="outline" size="icon" aria-label={t("syl.clear")} onClick={() => setText("")}><X /></Button>
              <Button variant="outline" size="icon" aria-label={t("syl.next")} disabled={sel >= list.length - 1} onClick={() => setSel(sel + 1)}><ArrowRight /></Button>
            </div>
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <Switch checked={joins} onCheckedChange={setJoins} />
            {t("syl.joins")}
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <Switch checked={hear} onCheckedChange={setHear} />
            {t("syl.hear")}
          </label>
          <div className="flex-1" />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("syl.fromHere")}</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" disabled={sel === 0} onClick={() => shift(-1)}><ArrowLeft />{t("syl.earlier")}</Button>
              <Button variant="outline" size="sm" onClick={() => shift(1)}>{t("syl.later")}<ArrowRight /></Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-[440px] overflow-y-auto rounded-md border p-2">
        <ScoreView
          xml={liveXml}
          beat={cur?.beat ?? 0}
          hint={t("syl.hint")}
          onHit={(hit) => {
            const i = list.findIndex((s) => Math.abs(s.beat - hit.beat) < 1e-3)
            setSel(i >= 0 ? i : Math.max(0, list.filter((s) => s.beat <= hit.beat + 1e-3).length - 1))
            if (hear && hit.note) {
              const secs = Math.min(1.5, Math.max(0.35, hit.note.quarters * 0.6))
              return startTone([hit.note.frequency], secs, sound)
            }
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("syl.tip")}
      </p>
    </Card>
  )
}
