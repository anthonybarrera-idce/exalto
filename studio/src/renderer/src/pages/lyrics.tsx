import { RotateCcw, Save } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Empty, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LyricsEditor } from "@/components/lyrics-editor"
import { useStudio } from "@/hooks/use-studio"
import { cleanLyrics, lyricsToPlainText, parseLyricText } from "@/lib/lyric-blocks"
import { studio, type HymnDetail, type LyricSection } from "@/lib/studio"
import { SyllableEditor } from "@/components/syllable-editor"
import { useT } from "@/hooks/use-locale"

/** The saved lyrics as blocks: hymn.json's sections, or lyrics.txt split into blocks if those are empty. */
const savedSections = (d: HymnDetail): LyricSection[] => (d.hymn.lyrics?.length ? d.hymn.lyrics : parseLyricText(d.lyricsText ?? ""))

export function LyricsPage() {
  const { detail, refresh } = useStudio()
  const t = useT()
  const [sections, setSections] = useState<LyricSection[]>([])
  const [repeatChorus, setRepeatChorus] = useState(false)
  const [reverted, setReverted] = useState<Set<number>>(new Set())
  const reset = () => {
    if (!detail) return
    setSections(savedSections(detail))
    setRepeatChorus(!!detail.hymn.repeatChorus)
  }
  useEffect(() => {
    reset()
    setReverted(new Set())
  }, [detail?.slug, detail?.lyricsText, detail?.hymn])
  if (!detail) return <Empty>{t("common.convertFirst")}</Empty>
  const { corrections, warnings } = detail.review
  const dirty = JSON.stringify(sections) !== JSON.stringify(savedSections(detail)) || repeatChorus !== !!detail.hymn.repeatChorus
  const otherNotes = warnings.filter((w) => !w.startsWith("Lyrics corrected"))

  // Undo an OCR correction in the first line that still has the corrected word.
  const revert = (i: number) => {
    const c = corrections[i]
    let done = false
    const next = sections.map((s) => ({
      ...s,
      lines: s.lines.map((l) => {
        if (done || !l.includes(c.to)) return l
        done = true
        return l.replace(c.to, c.from)
      }),
    }))
    if (!done) return toast.error(t("lyrics.gone", { word: c.to }))
    setSections(next)
    setReverted(new Set([...reverted, i]))
  }
  const save = async () => {
    const clean = cleanLyrics(sections)
    await studio.saveLyrics(detail.slug, lyricsToPlainText(clean), clean)
    if (repeatChorus !== !!detail.hymn.repeatChorus) await studio.saveDetails(detail.slug, { repeatChorus })
    toast.success(t("lyrics.saved"))
    refresh()
  }

  return (
    <>
      <PageHeader
        title={t("lyrics.title")}
        sub={detail.review.kind === "lyrics" ? t("lyrics.subTyped") : t("lyrics.subScanned")}
        badge={corrections.length ? <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">{t("lyrics.corrected", { count: corrections.length })}</Badge> : undefined}
      >
        <Button variant="outline" disabled={!dirty} onClick={reset}>{t("lyrics.discard")}</Button>
        <Button disabled={!dirty} onClick={save}><Save />{t("lyrics.save")}</Button>
      </PageHeader>
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{t("lyrics.text")}</span>
            <span className="text-xs text-muted-foreground">{t("lyricsEditor.order")}</span>
          </div>
          <LyricsEditor sections={sections} onChange={setSections} repeatChorus={repeatChorus} onRepeatChorusChange={setRepeatChorus} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">{t("lyrics.corrections")} <Badge variant="secondary">{corrections.length}</Badge></div>
            {corrections.length === 0 && <div className="text-sm text-muted-foreground">{t("lyrics.noCorrections")}</div>}
            {corrections.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="flex-1">
                  <span className="text-red-700 line-through dark:text-red-400">{c.from}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className={reverted.has(i) ? "text-muted-foreground line-through" : "font-medium text-green-700 dark:text-green-400"}>{c.to}</span>
                </div>
                <Button variant="ghost" size="sm" disabled={reverted.has(i)} onClick={() => revert(i)}><RotateCcw />{t("lyrics.revert")}</Button>
              </div>
            ))}
          </Card>
          {otherNotes.length > 0 && (
            <Card className="gap-2 p-5 text-sm">
              <div className="font-semibold">{t("lyrics.notes")}</div>
              {otherNotes.map((w, i) => <p key={i} className="text-muted-foreground">{w}</p>)}
            </Card>
          )}
        </div>
      </div>
      {detail.review.kind !== "lyrics" && (
        <div className="mt-5">
          <SyllableEditor detail={detail} onSaved={refresh} />
        </div>
      )}
    </>
  )
}
