import { Link2, Loader2, Sparkles, Trash2, Upload, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useStudio } from "@/hooks/use-studio"
import { studio } from "@/lib/studio"
import { useLocale } from "@/hooks/use-locale"

export function ImportPage({ go }: { go: (p: PageId) => void }) {
  const { job, startJob, hymns, select, remove, reprocess } = useStudio()
  // Reading an import again with AI uses Claude when its key is saved, else Gemini.
  const [aiEngine, setAiEngine] = useState<"claude" | "gemini" | null>(null)
  useEffect(() => {
    studio.keyStatus().then((s) => setAiEngine(s.anthropic ? "claude" : s.gemini ? "gemini" : null), () => setAiEngine(null))
  }, [])
  const aiName = aiEngine === "claude" ? "Claude" : "Gemini"
  const readAgain = (slug: string, title: string) =>
    reprocess(slug, aiEngine!, correct).then(
      (started) => started && toast(t("import.reprocessStarted", { title, provider: aiName })),
      (e) => toast.error(t("import.reprocessFailed", { error: String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "") })),
    )
  const { t, plural, hymnal: hymnalLabel } = useLocale()
  const [inputs, setInputs] = useState<string[]>([])
  const [link, setLink] = useState("")
  const [engine, setEngine] = useState("local")
  const [hymnal, setHymnal] = useState("community")
  const [tempo, setTempo] = useState("80")
  const [correct, setCorrect] = useState(true)
  const [dragging, setDragging] = useState(false)

  const add = (items: string[]) => setInputs((cur) => [...new Set([...cur, ...items.filter(Boolean)])])
  const addLink = () => {
    if (!/^https:\/\/(docs|drive)\.google\.com\/(presentation|file)\/d\//.test(link.trim())) {
      toast.error(t("import.badLink"))
      return
    }
    add([link.trim()])
    setLink("")
  }
  const progress = useMemo(() => job.log.filter((l) => /transcribing slide|piano audio|♪/.test(l)).slice(-1)[0], [job.log])

  const run = async () => {
    try {
      await startJob({ inputs, engine, hymnal, tempo: Number(tempo) || 80, correct })
      setInputs([])
    } catch (e) {
      toast.error(String(e))
    }
  }

  return (
    <>
      <PageHeader title={t("import.title")} sub={t("import.sub")}>
        {job.running ? (
          <Button variant="outline" onClick={() => studio.cancel()}>
            {t("import.cancel")}
          </Button>
        ) : null}
        <Button disabled={!inputs.length || job.running} onClick={run}>
          {job.running ? <Loader2 className="animate-spin" /> : null}
          {job.running ? t("import.converting") : inputs.length ? plural("import.convert", inputs.length) : t("import.convertNone")}
        </Button>
      </PageHeader>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add([...e.dataTransfer.files].map((f) => studio.pathForFile(f)))
        }}
        className={`flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-7 text-center ${dragging ? "border-foreground bg-accent" : "bg-muted/40"}`}
      >
        <Upload className="size-6 text-muted-foreground" />
        <div className="font-medium">{t("import.drop")}</div>
        <div className="text-sm text-muted-foreground">{t("import.dropHelp")}</div>
        <div className="mt-2 flex w-full max-w-2xl gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="https://docs.google.com/presentation/d/…" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} />
          </div>
          <Button variant="outline" onClick={addLink}>
            {t("import.addLink")}
          </Button>
          <Button variant="ghost" onClick={async () => add(await studio.pickDecks())}>
            {t("import.chooseFiles")}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-4">
        <Field label={t("import.reader")} help={t("import.readerHelp")}>
          <Select value={engine} onValueChange={setEngine}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">{t("import.engineLocal")}</SelectItem>
              <SelectItem value="claude">{t("import.engineClaude")}</SelectItem>
              <SelectItem value="gemini">{t("import.engineGemini")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("import.hymnal")} help={t("import.hymnalHelp")}>
          <Select value={hymnal} onValueChange={setHymnal}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["community", "idc-himnario", "canticos-espirituales"].map((id) => (
                <SelectItem key={id} value={id}>{hymnalLabel(id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("import.tempo")} help={t("import.tempoHelp")}>
          <Input type="number" min={30} max={220} value={tempo} onChange={(e) => setTempo(e.target.value)} />
        </Field>
        <Field label={t("import.correct")} help={t("import.correctHelp")}>
          <div className="flex h-9 items-center gap-2">
            <Switch checked={correct} onCheckedChange={setCorrect} id="correct" />
            <Label htmlFor="correct" className="font-normal">{t("import.correctLabel")}</Label>
          </div>
        </Field>
      </div>

      <Card className="mt-5 gap-0 overflow-hidden py-0">
        <Row head cells={[t("import.colDeck"), t("import.colPages"), t("import.colStatus"), ""]} />
        {inputs.map((i) => (
          <Row
            key={i}
            cells={[
              <Name title={i.split("/").pop()!} sub={i.startsWith("http") ? t("import.googleLink") : i.toLowerCase().endsWith(".pdf") ? t("import.pdf") : t("import.slideDeck")} />,
              "—",
              <Badge variant="secondary">{t("import.ready")}</Badge>,
              <Button variant="ghost" size="icon" aria-label={t("import.remove")} onClick={() => setInputs(inputs.filter((x) => x !== i))}><X /></Button>,
            ]}
          />
        ))}
        {job.running && (
          <Row cells={[<Name title={t("import.convertingRow")} sub={progress ?? t("import.starting")} />, "", <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">{t("import.working")}</Badge>, <Loader2 className="size-4 animate-spin" />]} />
        )}
        {hymns.map((h) => (
          <Row
            key={h.slug}
            cells={[
              <Name title={h.title} sub={h.kind === "lyrics" ? t("import.lyricsOnly") : t("import.measuresBpm", { measures: h.measures, bpm: h.bpm })} />,
              h.kind === "lyrics" ? "—" : t("import.measuresShort", { measures: h.measures }),
              h.flagged.length || h.corrections.length ? (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("import.doneReview", { count: h.flagged.length + h.corrections.length })}</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{t("import.done")}</Badge>
              ),
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => (select(h.slug), go(h.kind === "lyrics" ? "lyrics" : "review"))}>{t("import.review")}</Button>
                {h.kind !== "lyrics" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={aiEngine ? t("import.reprocess", { title: h.title, provider: aiName }) : t("import.reprocessNeedsKey")}
                    title={aiEngine ? t("import.reprocess", { title: h.title, provider: aiName }) : t("import.reprocessNeedsKey")}
                    disabled={job.running || !aiEngine}
                    onClick={() => readAgain(h.slug, h.title)}
                  >
                    <Sparkles />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("import.delete", { title: h.title })}
                  title={t("import.delete", { title: h.title })}
                  disabled={job.running}
                  onClick={() =>
                    remove(h.slug).then(
                      (done) => done && toast.success(t("import.deleted", { title: h.title })),
                      (e) => toast.error(t("import.deleteFailed", { error: String(e?.message ?? e) })),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>,
            ]}
          />
        ))}
        {!inputs.length && !hymns.length && !job.running && <div className="p-8 text-center text-sm text-muted-foreground">{t("import.empty")}</div>}
      </Card>

      {job.log.length > 0 && (
        <details className="mt-4 text-xs text-muted-foreground" open={job.done !== undefined && job.done !== 0}>
          <summary className="cursor-pointer">{t("import.log")}</summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3 font-mono">{job.log.join("\n")}</pre>
        </details>
      )}
    </>
  )
}

function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      <span className="text-xs text-muted-foreground">{help}</span>
    </div>
  )
}

function Name({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{title}</div>
      <div className="truncate text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function Row({ cells, head }: { cells: React.ReactNode[]; head?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_90px_220px_150px] items-center gap-3 border-t px-5 first:border-t-0 ${head ? "bg-muted/50 py-2.5 text-xs font-medium text-muted-foreground" : "py-3.5 text-sm"}`}>
      {cells.map((c, i) => (
        <div key={i} className={i === 3 ? "flex justify-end" : "min-w-0"}>{c}</div>
      ))}
    </div>
  )
}
