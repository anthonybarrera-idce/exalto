import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useLocale } from "@/hooks/use-locale"
import { lyricsToPlainText, parseLyricText, renumber } from "@/lib/lyric-blocks"
import type { LyricSection } from "@/lib/studio"

const TYPES = ["verse", "chorus", "bridge"] as const

/**
 * The admin hymn editor's lyrics view (admin/src/pages/hymn-editor.tsx): ordered verse / chorus / bridge blocks
 * you can add, reorder and remove, or the whole hymn as plain text ("I", "II"…, "Coro", "Puente").
 */
export function LyricsEditor({
  sections,
  onChange,
  repeatChorus,
  onRepeatChorusChange,
}: {
  sections: LyricSection[]
  onChange: (sections: LyricSection[]) => void
  repeatChorus: boolean
  onRepeatChorusChange: (v: boolean) => void
}) {
  const { t } = useLocale()
  const [mode, setMode] = useState<"blocks" | "text">("blocks")
  const [plain, setPlain] = useState("")
  const setSections = (fn: (s: LyricSection[]) => LyricSection[]) => onChange(renumber(fn(sections)))
  const label = (s: LyricSection) => (s.type === "verse" ? t("lyricsEditor.verseN", { n: s.number ?? "" }).trim() : t(`lyricsEditor.${s.type}`))
  const move = (i: number, d: -1 | 1) =>
    setSections((all) => {
      const n = [...all]
      ;[n[i + d], n[i]] = [n[i], n[i + d]]
      return n
    })

  const switchMode = (next: "blocks" | "text") => {
    if (next === "text") setPlain(lyricsToPlainText(sections))
    else setSections(() => parseLyricText(plain))
    setMode(next)
  }

  return (
    <Tabs value={mode} onValueChange={(v) => switchMode(v as "blocks" | "text")}>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="blocks">{t("lyricsEditor.blocks")}</TabsTrigger>
          <TabsTrigger value="text">{t("lyricsEditor.text")}</TabsTrigger>
        </TabsList>
        {mode === "blocks" && (
          <div className="ml-auto flex gap-1.5">
            {TYPES.map((type) => (
              <Button key={type} type="button" size="sm" variant="outline" onClick={() => setSections((s) => [...s, { type, lines: [] }])}>
                <Plus /> {t(`lyricsEditor.${type}`)}
              </Button>
            ))}
          </div>
        )}
      </div>
      <TabsContent value="blocks" className="mt-3 flex flex-col gap-3">
        {sections.map((s, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Badge variant={s.type === "chorus" ? "default" : "secondary"}>{label(s)}</Badge>
              <div className="ml-auto flex">
                <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === 0} aria-label={t("lyricsEditor.moveUp")} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === sections.length - 1} aria-label={t("lyricsEditor.moveDown")} onClick={() => move(i, 1)}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t("lyricsEditor.remove")} onClick={() => setSections((all) => all.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            </div>
            <Textarea
              value={s.lines.join("\n")}
              onChange={(e) => {
                const lines = e.target.value.split("\n")
                setSections((all) => all.map((x, j) => (j === i ? { ...x, lines } : x)))
              }}
              rows={Math.max(3, s.lines.length)}
              placeholder={t("lyricsEditor.linePlaceholder")}
              className="leading-relaxed"
            />
          </div>
        ))}
        {sections.length === 0 && <p className="text-sm text-muted-foreground">{t("lyricsEditor.empty")}</p>}
        <div className="flex items-center gap-2">
          <Switch id="repeat-chorus" checked={repeatChorus} onCheckedChange={onRepeatChorusChange} />
          <Label htmlFor="repeat-chorus">{t("lyricsEditor.repeatChorus")}</Label>
        </div>
      </TabsContent>
      <TabsContent value="text" className="mt-3 flex flex-col gap-2">
        <Textarea
          value={plain}
          onChange={(e) => {
            setPlain(e.target.value)
            onChange(renumber(parseLyricText(e.target.value)))
          }}
          rows={18}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">{t("lyricsEditor.textHint")}</p>
      </TabsContent>
    </Tabs>
  )
}
