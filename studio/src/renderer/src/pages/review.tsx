import { Check, Loader2, RotateCcw, Sparkles, TriangleAlert, Undo2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { AiChatPanel } from "@/components/ai-chat-panel"
import { NoteEditor, type Sel } from "@/components/note-editor"
import { ScanView } from "@/components/scan-view"
import { Empty, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSound } from "@/hooks/use-sound"
import { useStudio } from "@/hooks/use-studio"
import { barLength, barStatus, groupBars } from "@/lib/notes"
import type { HymnState, Plan } from "@/lib/ai-chat"
import { cleanLyrics, lyricsToPlainText, parseLyricText } from "@/lib/lyric-blocks"
import { useLocale } from "@/hooks/use-locale"
import { asset, studio, type HymnDetail, type LyricSection, type Page } from "@/lib/studio"
import { cn } from "@/lib/utils"

const TIMES = ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8", "2/2", "3/2"]
const KEYS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]

/** What Undo restores: the notes, plus key and tempo (the assistant's transpose and tempo edits change those too). */
type Snap = { pages: Page[]; fifths: number; bpm: number; respell: boolean }
type Draft = { pages: Page[]; fifths: number; ts: string; bpm: number; respell: boolean; history: Snap[]; dirty: boolean }
const snap = (d: Draft): Snap => ({ pages: d.pages, fifths: d.fifths, bpm: d.bpm, respell: d.respell })

// Unsaved edits survive moving to another screen and back (until the hymn is saved or re-converted).
const drafts = new Map<string, { stamp: string; draft: Draft }>()
const stampOf = (d: HymnDetail) => JSON.stringify([d.review.bpm, d.review.key_fifths, d.review.time_signature, d.transcription.pages.length, d.files.find((f) => f.name === "transcription.json")?.size])

function fresh(d: HymnDetail): Draft {
  return {
    pages: structuredClone(d.transcription.pages),
    fifths: d.review.key_fifths ?? 0,
    ts: d.review.time_signature || "4/4",
    bpm: d.review.bpm || 80,
    respell: true,
    history: [],
    dirty: false,
  }
}

export function ReviewPage({ go }: { go: (p: PageId) => void }) {
  const { detail } = useStudio()
  const { t } = useLocale()
  if (!detail) return <Empty>{t("common.convertFirst")}</Empty>
  if (detail.review.kind === "lyrics") return <Empty>{t("review.lyricsOnly")}</Empty>
  return <Review key={detail.slug + stampOf(detail)} detail={detail} go={go} />
}

function Review({ detail, go }: { detail: HymnDetail; go: (p: PageId) => void }) {
  const { refresh } = useStudio()
  const { review, slug, hymn } = detail
  const { t, num, keyName, noteName, durName } = useLocale()
  const [sound] = useSound()
  const [draft, setDraftState] = useState<Draft>(() => {
    const saved = drafts.get(slug)
    return saved && saved.stamp === stampOf(detail) ? saved.draft : fresh(detail)
  })
  const setDraft = useCallback(
    (fn: (d: Draft) => Draft) =>
      setDraftState((d) => {
        const next = fn(d)
        drafts.set(slug, { stamp: stampOf(detail), draft: next })
        return next
      }),
    [slug, detail],
  )
  const [page, setPage] = useState(0)
  const [showOk, setShowOk] = useState(true)
  const [selBar, setSelBar] = useState(0)
  const [sel, setSel] = useState<Sel | null>(null)
  const [saving, setSaving] = useState(false)
  const [follow, setFollow] = useState(true)
  const [pulse, setPulse] = useState(0)

  const { pages, fifths, ts, bpm } = draft
  const barLen = barLength(ts)
  const bars = useMemo(() => groupBars(pages, barLen), [pages, barLen])
  const status = useMemo(() => barStatus(pages, bars, barLen), [pages, bars, barLen])
  const bad = status.filter((s) => !s).length
  const p = pages[Math.min(page, pages.length - 1)]
  const [W, H] = p.size ?? [2047, 1535]
  const barIdx = Math.min(selBar, bars.length - 1)
  const current = bars[barIdx]
  const flagged = review.flagged

  // What to show on the page: the selected note (and its measure piece), else the measure's piece on this page.
  const selPiece = sel && current ? current.pieces[sel.piece] : undefined
  const selNote = selPiece ? pages[selPiece.pi]?.measures[selPiece.mi]?.[sel!.voice][sel!.i] : undefined
  const shownPiece = selPiece?.pi === page ? selPiece : current?.pieces.find((x) => x.pi === page)
  const focus = {
    measure: shownPiece ? pages[shownPiece.pi].measures[shownPiece.mi]?.box ?? null : null,
    note: selPiece?.pi === page ? selNote?.box ?? null : null,
    label: selNote ? `${noteName(selNote.pitch)} · ${durName(selNote.dur)}` : undefined,
  }
  // Selecting a note on the other page of a split measure turns to that page.
  useEffect(() => {
    if (selPiece && selPiece.pi !== page) setPage(selPiece.pi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPiece?.pi])
  const keyChanged = fifths !== review.key_fifths

  const change = (mutate: (ps: Page[]) => void) =>
    setDraft((d) => {
      const next = structuredClone(d.pages)
      mutate(next)
      return { ...d, pages: next, history: [...d.history.slice(-99), snap(d)], dirty: true }
    })
  const undo = () =>
    setDraft((d) => (d.history.length ? { ...d, ...d.history[d.history.length - 1], history: d.history.slice(0, -1), dirty: true } : d))
  // An edit accepted from the assistant: same draft and Undo as a manual edit. A transpose already
  // moves the notes, so the key change must not re-read them (respell off).
  const applyAssistant = (plan: Extract<Plan, { kind: "score" }>) =>
    setDraft((d) => {
      const next = structuredClone(d.pages)
      plan.apply(next)
      const s = plan.settings ?? {}
      return {
        ...d,
        pages: next,
        ...(s.fifths != null ? { fifths: s.fifths, respell: false } : {}),
        ...(s.bpm != null ? { bpm: s.bpm } : {}),
        history: [...d.history.slice(-99), snap(d)],
        dirty: true,
      }
    })
  const [side, setSide] = useState<"score" | "assistant">("score")
  const sections: LyricSection[] = hymn.lyrics?.length ? hymn.lyrics : parseLyricText(detail.lyricsText ?? "")
  const selIndex = sel && current ? current.pieces.slice(0, sel.piece).reduce((a, x) => a + (pages[x.pi]?.measures[x.mi]?.[sel.voice].length ?? 0), 0) + sel.i : undefined
  const hymnState: HymnState = { title: review.title, pages, fifths, ts, bpm, sections, selection: { bar: barIdx, voice: sel?.voice, index: selIndex } }
  const saveAssistantLyrics = async (next: LyricSection[]) => {
    const clean = cleanLyrics(next)
    await studio.saveLyrics(slug, lyricsToPlainText(clean), clean)
    await refresh()
  }
  const discard = () => {
    drafts.delete(slug)
    setDraftState(fresh(detail))
    setSel(null)
  }
  const setting = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch, dirty: true }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).closest("input, textarea")) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const save = async () => {
    setSaving(true)
    try {
      const out = structuredClone(pages)
      out[0] = { ...out[0], key_fifths: fifths, time_signature: ts, tempo_bpm: bpm }
      await studio.saveEdits(slug, out, keyChanged && draft.respell ? review.key_fifths : null)
      drafts.delete(slug)
      toast.success(t("review.saved"))
      await refresh()
    } catch (e) {
      toast.error(t("review.saveFailed", { error: String(e).slice(0, 300) }))
    } finally {
      setSaving(false)
    }
  }

  const pickBar = (i: number) => {
    setSelBar(i)
    setSel(null)
    setPage(bars[i].page)
  }

  return (
    <>
      <PageHeader
        title={review.title}
        sub={t("review.sub", { author: hymn.author || t("review.unknownAuthor"), key: keyName(fifths) ?? t("review.unknownKey"), time: ts, bpm, measures: bars.length })}
        badge={
          draft.dirty ? (
            <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">{t("review.unsaved")}</Badge>
          ) : flagged.length ? (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("review.toCheck", { count: flagged.length })}</Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{t("review.allMatch")}</Badge>
          )
        }
      >
        {draft.dirty ? (
          <>
            <Button variant="ghost" onClick={undo} disabled={!draft.history.length || saving}><Undo2 /> {t("review.undo")}</Button>
            <Button variant="outline" onClick={discard} disabled={saving}><RotateCcw /> {t("common.discard")}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="animate-spin" /> {t("review.rebuilding")}</> : t("review.save")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => studio.reveal(slug)}>{t("review.showFiles")}</Button>
            <Button onClick={() => go("lyrics")}>{t("review.looksRight")}</Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-[1fr_320px] gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-3">
              <Tabs value={String(page)} onValueChange={(v) => setPage(Number(v))}>
                <TabsList>
                  {pages.map((_, i) => (
                    <TabsTrigger key={i} value={String(i)}>{t("review.page", { n: i + 1 })}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex-1" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch size="sm" checked={follow} onCheckedChange={setFollow} /> {t("review.zoomToSelection")}
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={showOk} onChange={(e) => setShowOk(e.target.checked)} /> {t("review.showAll")}
              </label>
            </div>
            <ScanView
              src={asset(slug, `pages/page${page + 1}.png`)}
              alt={t("review.page", { n: page + 1 })}
              size={[W, H]}
              heads={p.heads ?? []}
              showOk={showOk}
              measure={focus.measure}
              note={focus.note}
              label={focus.label}
              pulse={pulse}
              follow={follow}
              focusKey={`${page}:${barIdx}:${sel ? `${sel.piece}.${sel.voice}.${sel.i}` : "-"}`}
            />
            {!focus.measure && current?.pieces.some((x) => x.pi === page) && (
              <div className="text-xs text-muted-foreground">{t("review.noBoxes")}</div>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold">{t("review.measure", { n: barIdx + 1 })}</div>
              {barIdx === 0 && status[0] && current && current.pieces.length === 1 && bars.length > 1 && <span className="text-xs text-muted-foreground">{t("review.pickup")}</span>}
              {current && current.pieces.length > 1 && <span className="text-xs text-muted-foreground">{t("review.continues")}</span>}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" disabled={barIdx === 0} onClick={() => pickBar(barIdx - 1)}>{t("review.previous")}</Button>
              <Button size="sm" variant="ghost" disabled={barIdx >= bars.length - 1} onClick={() => pickBar(barIdx + 1)}>{t("review.next")}</Button>
            </div>
            {current && (
              <NoteEditor
                pages={pages}
                bar={current}
                number={barIdx}
                barLen={barLen}
                barOk={status[barIdx]}
                fifths={fifths}
                bpm={bpm}
                sound={sound}
                sel={sel}
                onSelect={setSel}
                onChange={change}
                onPlayed={() => setPulse((n) => n + 1)}
              />
            )}
          </Card>

        </div>

        <div className="flex flex-col gap-4">
          <Tabs value={side} onValueChange={(v) => setSide(v as "score" | "assistant")}>
            <TabsList className="w-full">
              <TabsTrigger value="score">{t("chat.settingsTab")}</TabsTrigger>
              <TabsTrigger value="assistant"><Sparkles /> {t("chat.tab")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {side === "assistant" ? (
            <AiChatPanel
              slug={slug}
              state={hymnState}
              applyScore={applyAssistant}
              saveLyrics={saveAssistantLyrics}
              showBar={pickBar}
              openSettings={() => go("settings")}
            />
          ) : (
          <>
          <Card className="gap-3 p-5 text-sm">
            <div className="font-semibold">{t("review.scoreSettings")}</div>
            <Field label={t("review.key")}>
              <Select value={String(fifths)} onValueChange={(v) => setting({ fifths: Number(v) })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KEYS.map((k) => (
                    <SelectItem key={k} value={String(k)}>
                      {keyName(k)} · {k === 0 ? t("review.noAccidentals") : `${Math.abs(k)} ${k < 0 ? "♭" : "♯"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {keyChanged && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox checked={draft.respell} onCheckedChange={(v) => setting({ respell: v === true })} className="mt-0.5" />
                <span>{t("review.respell")}</span>
              </label>
            )}
            <Field label={t("review.time")}>
              <Select value={ts} onValueChange={(v) => setting({ ts: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(TIMES.includes(ts) ? TIMES : [ts, ...TIMES]).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("review.tempo")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={30}
                  max={240}
                  value={bpm}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v > 0) setting({ bpm: v })
                  }}
                  className="h-8 w-20"
                />
                <span className="text-muted-foreground">BPM (♩)</span>
              </div>
            </Field>
            <div className="text-xs text-muted-foreground">
              {t("review.inScore", { key: keyName(review.key_fifths) ?? review.key_fifths, time: review.time_signature, bpm: review.bpm })}
            </div>
          </Card>

          <Card className="gap-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {t("review.measures")} {bad > 0 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("review.off", { count: bad })}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{t("review.measuresHelp", { beats: num(barLen) })}</div>
            <div className="flex flex-wrap gap-1.5">
              {bars.map((b, i) => (
                <button
                  key={i}
                  onClick={() => pickBar(i)}
                  title={t("review.measureTitle", { n: i + 1, page: b.page + 1 })}
                  className={cn(
                    "flex size-7.5 items-center justify-center rounded-md text-xs font-medium",
                    status[i] ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                    i === barIdx && "ring-2 ring-sky-500",
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </Card>

          <Card className="gap-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {t("review.needsLook")} <Badge variant="secondary">{flagged.length}</Badge>
            </div>
            {flagged.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4" /> {t("review.everyMatches")}</div>
            )}
            {flagged.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <TriangleAlert className="size-4 text-fuchsia-600" />
                <div className="flex-1">
                  <div className="font-medium">{t("review.flagPage", { page: f.page, pitch: noteName(f.pitch) })}</div>
                  <div className="text-xs text-muted-foreground">{t("review.shapeMismatch")}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPage(f.page - 1)}>{t("review.show")}</Button>
              </div>
            ))}
          </Card>
          </>
          )}
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
