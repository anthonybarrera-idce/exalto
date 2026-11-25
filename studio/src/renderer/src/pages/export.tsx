import { Check, CloudUpload, FileText, FolderOpen, Link2, Loader2, LogIn } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { Empty, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStudio } from "@/hooks/use-studio"
import { studio, type HymnDetail } from "@/lib/studio"
import { useAuth } from "@/hooks/use-auth"
import { firebaseConfigured, usingEmulators } from "@/lib/firebase"
import { existingHymn, numberTakenBy, uploadHymn, type UploadStep } from "@/lib/upload"
import { Progress } from "@/components/ui/progress"
import { AttachDialog } from "@/components/attach-dialog"
import { useLocale } from "@/hooks/use-locale"
import type { StringKey } from "@/lib/i18n"
import { VOICES, type Voice } from "@/lib/notes"

/** What each converter file is; `{voice}` is filled from the file name (soprano, alto…). */
const DESCRIBE: [RegExp, StringKey][] = [
  [/\.musicxml$/, "file.musicxml"],
  [/\.mid$/, "file.mid"],
  [/-piano\.(m4a|wav)$/, "file.piano"],
  [/-piano-(\w+)\.(m4a|wav)$/, "file.pianoVoice"],
  [/-tone\.wav$/, "file.tone"],
  [/-tone-(\w+)\.wav$/, "file.toneVoice"],
  [/^lyrics\.txt$/, "file.lyrics"],
  [/^hymn\.json$/, "file.hymnJson"],
  [/^WARNINGS\.txt$/, "file.warnings"],
  [/^transcription\.json$/, "file.transcription"],
  [/^review\.json$/, "file.review"],
]
const isVoice = (v: string | undefined): v is Voice => VOICES.includes(v as Voice)

/** lib/upload.ts reports its steps with English labels; show them in the current language. */
const STEP_KEYS: Record<string, StringKey> = {
  "Piano · all voices": "upload.step.audio",
  "Score (MusicXML)": "upload.step.score",
  "Practice notes": "upload.step.practice",
  "Hymn and lyrics": "upload.step.hymn",
}

export function ExportPage({ go }: { go: (p: PageId) => void }) {
  const { detail } = useStudio()
  const { t, plural, num, voiceName } = useLocale()
  const describe = (n: string) => {
    for (const [re, key] of DESCRIBE) {
      const m = n.match(re)
      if (m) return t(key, { voice: isVoice(m[1]) ? voiceName(m[1]) : (m[1] ?? "") })
    }
    return ""
  }
  const kb = (b: number) => (b > 1024 * 1024 ? `${num(b / 1024 / 1024, 1)} MB` : `${num(Math.max(1, Math.round(b / 1024)))} KB`)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!detail) return
    setPicked(new Set(detail.files.filter((f) => !/\.(wav|m4a|mp3)$|transcription|review\.json/.test(f.name)).map((f) => f.name)))
  }, [detail?.slug])
  if (!detail) return <Empty>{t("common.convertFirst")}</Empty>
  const files = detail.files.filter((f) => f.name.includes("."))

  const save = async () => {
    const dest = await studio.saveTo(detail.slug, [...picked])
    if (dest) toast.success(plural("export.saved", picked.size, { dest }))
  }
  return (
    <>
      <PageHeader title={t("export.title")} sub={t("export.sub")}>
        <Button variant="outline" onClick={() => studio.reveal(detail.slug)}><FolderOpen />{t("export.showInFinder")}</Button>
      </PageHeader>
      <div className="grid grid-cols-[1fr_360px] items-start gap-5">
        <Card className="gap-0 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">{t("export.files")} <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{t("export.selected", { count: picked.size })}</Badge></div>
          {files.map((f) => (
            <label key={f.name} className="flex items-center gap-3 border-t py-2.5">
              <Checkbox checked={picked.has(f.name)} onCheckedChange={(c) => setPicked((s) => { const n = new Set(s); c ? n.add(f.name) : n.delete(f.name); return n })} />
              <FileText className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">{describe(f.name)}</div>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{kb(f.size)}</span>
            </label>
          ))}
          <div className="pt-3">
            <Button variant="outline" disabled={!picked.size} onClick={save}>{t("export.saveTo")}</Button>
          </div>
        </Card>
        <UploadCard detail={detail} go={go} />
      </div>
    </>
  )
}

function UploadCard({ detail, go }: { detail: HymnDetail; go: (p: PageId) => void }) {
  const { user, canUpload, signIn, refreshRole } = useAuth()
  const { t, rich, hymnal, status, voiceName } = useLocale()
  const stepLabel = (label: string) => {
    const voice = /^Piano · (\w+)$/.exec(label)?.[1]
    if (STEP_KEYS[label]) return t(STEP_KEYS[label])
    return isVoice(voice) ? t("upload.step.voice", { voice: voiceName(voice) }) : label
  }
  const [steps, setSteps] = useState<UploadStep[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [attaching, setAttaching] = useState(false)
  useEffect(() => setSteps(null), [detail.slug])
  const h = detail.hymn
  const lyricsOnly = detail.review.kind === "lyrics"

  if (!firebaseConfigured && !usingEmulators) {
    return (
      <Card className="gap-2 p-5 text-sm">
        <div className="font-semibold">{t("upload.title")}</div>
        <p className="text-muted-foreground">{rich("upload.noFirebase", { example: <code>studio/.env.example</code>, local: <code>studio/.env.local</code> })}</p>
      </Card>
    )
  }

  const upload = async () => {
    setBusy(true)
    try {
      const taken = await numberTakenBy(h.hymnalId, h.number, detail.slug)
      if (taken && !confirm(t("upload.numberTaken", { hymnal: hymnal(h.hymnalId), number: h.number ?? "", title: taken }))) return
      const prev = await existingHymn(h.hymnalId, detail.slug)
      if (prev && !confirm(t(lyricsOnly ? "upload.replace" : "upload.replaceAll", { title: prev.title ?? h.title, status: status(prev.status) }))) return
      const r = await uploadHymn(detail, setSteps)
      toast.success(r.created ? t("upload.created") : t("upload.updated", { status: status(r.status) }), { description: t("upload.publishHint") })
    } catch (e) {
      toast.error(t("upload.failed"), { description: String(e).slice(0, 300) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <div className="text-sm font-semibold">{t("upload.title")}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {lyricsOnly ? t("upload.descLyrics") : t("upload.descAll")}
        </p>
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">{h.title}</span>
          <Button variant="ghost" size="sm" onClick={() => go("details")}>{t("upload.editDetails")}</Button>
        </div>
        <div className="text-muted-foreground">
          {hymnal(h.hymnalId)} · {h.number != null ? t("upload.numberLabel", { number: h.label ?? h.number }) : t("upload.noNumber")} · {h.author || t("upload.noAuthor")}
        </div>
      </div>
      {!user ? (
        <Button onClick={() => signIn().catch((e) => toast.error(t("upload.signInFailed"), { description: String(e) }))}>
          <LogIn />{t("upload.signIn")}
        </Button>
      ) : !canUpload ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">{t("upload.noRole", { email: user.email ?? "" })}</p>
          <Button variant="outline" onClick={refreshRole}>{t("upload.gotRole")}</Button>
        </div>
      ) : (
        <>
          {steps && (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              {steps.map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-xs">
                  {s.done ? <Check className="size-3.5 text-green-600" /> : <Loader2 className={busy ? "size-3.5 animate-spin" : "size-3.5"} />}
                  <span className="w-36 truncate">{stepLabel(s.label)}</span>
                  <Progress value={s.progress * 100} className="h-1.5 flex-1" />
                </div>
              ))}
            </div>
          )}
          <Button onClick={upload} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <CloudUpload />}{t("upload.button")}
          </Button>
          {!lyricsOnly && (
            <>
              <Button variant="outline" onClick={() => setAttaching(true)} disabled={busy} title={t("attach.openHint")}>
                <Link2 />{t("attach.open")}
              </Button>
              {attaching && <AttachDialog slug={detail.slug} onClose={() => setAttaching(false)} />}
            </>
          )}
          <p className="text-xs text-muted-foreground">{t("upload.signedInAs", { email: user.email ?? "" })}</p>
        </>
      )}
    </Card>
  )
}
