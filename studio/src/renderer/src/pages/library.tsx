import { Download, FolderOpen, Loader2, Music, Save, Search, Trash2 } from "lucide-react"
import { HymnArt } from "@/components/hymn-art"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LyricsEditor } from "@/components/lyrics-editor"
import { AttachDialog } from "@/components/attach-dialog"
import { hasNotes } from "@/lib/attach"
import { useLocale } from "@/hooks/use-locale"
import { useStudio } from "@/hooks/use-studio"
import { deleteLibraryHymn, saveLibraryHymn, STATUSES, watchLibrary, type HymnStatus, type LibraryHymn } from "@/lib/library"
import { cleanLyrics } from "@/lib/lyric-blocks"
import type { LyricSection } from "@/lib/studio"
import { useHymnals } from "@/lib/hymnals"
import { cn } from "@/lib/utils"
import { hymnNumberText } from "@/lib/hymn-number"

const TONE: Record<HymnStatus, string> = {
  draft: "bg-muted text-foreground",
  review: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  published: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  hidden: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
}
const MAX_ROWS = 200

function StatusBadge({ status }: { status: HymnStatus }) {
  const { t } = useLocale()
  return <span className={cn("inline-flex h-5 w-fit items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", TONE[status])}>{t(`library.status.${status}`)}</span>
}

function matches(h: LibraryHymn, q: string) {
  if (!q) return true
  const needle = q.toLowerCase()
  if (String(h.number ?? "") === needle || hymnNumberText(h)?.toLowerCase() === needle) return true
  if (h.title.toLowerCase().includes(needle)) return true
  return h.lyrics.some((s) => s.lines.some((l) => l.toLowerCase().includes(needle)))
}

// Set by the Hymnals tab so the library opens already filtered to that hymnal.
let pendingFilter: string | null = null
export function openLibraryAt(hymnalId: string, go: (p: PageId) => void) {
  pendingFilter = hymnalId
  go("library")
}

/** Owners, admins and editors: browse and edit every hymn in Exalto, like the admin's Hymns page and editor. */
export function LibraryPage({ go }: { go: (p: PageId) => void }) {
  const { t, hymnal, language } = useLocale()
  const HYMNALS = useHymnals()
  const [hymns, setHymns] = useState<LibraryHymn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>(() => {
    const f = pendingFilter ?? "all"
    pendingFilter = null
    return f
  })
  const [q, setQ] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => watchLibrary(setHymns, (e) => setError(e.message)), [])

  const rows = useMemo(
    () =>
      (hymns ?? [])
        .filter((h) => (filter === "all" ? true : filter === "draft" ? h.status === "draft" : filter === "nonotes" ? !hasNotes(h) : h.hymnalId === filter))
        .filter((h) => matches(h, q.trim()))
        .sort((a, b) => a.hymnalId.localeCompare(b.hymnalId) || (a.number ?? Infinity) - (b.number ?? Infinity) || (a.label ?? "").localeCompare(b.label ?? "") || a.title.localeCompare(b.title)),
    [hymns, filter, q],
  )
  const selected = hymns?.find((h) => h.id === selectedId) ?? null
  const date = (ts?: { toDate(): Date }) => (ts ? ts.toDate().toLocaleDateString(language, { month: "short", day: "numeric" }) : "—")

  const chips = [
    { id: "all", label: t("library.all", { count: hymns?.length ?? 0 }) },
    ...HYMNALS.map((hm) => ({ id: hm.id, label: t("library.hymnalCount", { name: hymnal(hm.id), count: (hymns ?? []).filter((h) => h.hymnalId === hm.id).length }) })),
    { id: "draft", label: t("library.drafts", { count: (hymns ?? []).filter((h) => h.status === "draft").length }) },
    { id: "nonotes", label: t("library.noNotes", { count: (hymns ?? []).filter((h) => !hasNotes(h)).length }) },
  ]

  return (
    <>
      <PageHeader title={t("library.title")} sub={t("library.sub")}>
        <Button variant="outline" onClick={() => go("attach")}><Music />{t("library.addNotesBulk")}</Button>
        <Button onClick={() => go("import")}><Download />{t("library.import")}</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {chips.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === c.id ? "bg-foreground text-background" : "bg-muted text-foreground/80 hover:bg-accent")}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("library.search")} className="h-8 pl-8 text-xs" />
        </div>
      </div>

      {error ? (
        <Card className="p-5 text-sm"><div className="font-medium">{t("library.loadError")}</div><p className="text-muted-foreground">{error}</p></Card>
      ) : !hymns ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("library.loading")}</div>
      ) : (
        <div className="grid grid-cols-[1fr_440px] items-start gap-4">
          <Card className="gap-0 overflow-hidden p-0">
            <div className="grid grid-cols-[44px_1fr_140px_96px_64px] gap-3 border-b bg-sidebar px-5 py-2 text-xs font-medium text-muted-foreground">
              <span>{t("library.col.no")}</span><span>{t("library.col.hymn")}</span><span>{t("library.col.hymnal")}</span><span>{t("library.col.status")}</span><span>{t("library.col.updated")}</span>
            </div>
            {rows.slice(0, MAX_ROWS).map((h) => (
              <button
                key={h.id}
                onClick={() => setSelectedId(h.id)}
                className={cn("grid w-full grid-cols-[44px_1fr_140px_96px_64px] items-center gap-3 border-b border-muted px-5 py-2 text-left last:border-b-0 hover:bg-accent/60", selectedId === h.id && "bg-sidebar-accent")}
              >
                <span className="text-[13px] font-medium text-foreground/80 tabular-nums">{hymnNumberText(h) ?? "—"}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{h.title}</span>
                  {hasNotes(h) && <Music aria-label={t("attach.hasNotes")} className="size-3 shrink-0 text-green-600" />}
                </span>
                <span className="truncate text-xs text-foreground/80">{hymnal(h.hymnalId)}</span>
                <StatusBadge status={h.status} />
                <span className="text-xs text-muted-foreground">{date(h.updatedAt)}</span>
              </button>
            ))}
            {rows.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">{t("library.none")}</div>}
            <div className="border-t px-5 py-2.5 text-xs text-muted-foreground">{t("library.shown", { shown: Math.min(rows.length, MAX_ROWS), total: rows.length })}</div>
          </Card>
          {selected ? (
            <Editor key={selected.id + (selected.updatedAt?.toMillis() ?? "")} hymn={selected} go={go} onDeleted={() => setSelectedId(null)} />
          ) : (
            <Card className="p-5 text-sm text-muted-foreground">{t("library.selectHint")}</Card>
          )}
        </div>
      )}
    </>
  )
}

type Form = { title: string; hymnalId: string; number: string; label: string; author: string; language: "es" | "en"; tags: string; repeatChorus: boolean; status: HymnStatus; lyrics: LyricSection[] }
const toForm = (h: LibraryHymn): Form => ({
  title: h.title,
  hymnalId: h.hymnalId,
  number: h.number != null ? String(h.number) : "",
  label: h.label ?? "",
  author: h.author,
  language: h.language,
  tags: h.tags.join(", "),
  repeatChorus: h.repeatChorus,
  status: h.status,
  lyrics: h.lyrics,
})

function Editor({ hymn, go, onDeleted }: { hymn: LibraryHymn; go: (p: PageId) => void; onDeleted: () => void }) {
  const { t, hymnal } = useLocale()
  const HYMNALS = useHymnals()
  const studioHymns = useStudio()
  const [form, setForm] = useState<Form>(() => toForm(hymn))
  const [busy, setBusy] = useState<"save" | "delete" | null>(null)
  const [attaching, setAttaching] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const saved = toForm(hymn)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  // Studio keeps converted hymns by slug; uploads use the doc id `{hymnalId}-{slug}` (lib/upload.ts).
  const slug = hymn.id.startsWith(`${hymn.hymnalId}-`) ? hymn.id.slice(hymn.hymnalId.length + 1) : null
  const local = !!slug && studioHymns.hymns.some((h) => h.slug === slug)

  const save = async () => {
    const number = form.number.trim() ? Number(form.number) : null
    if (number != null && !Number.isInteger(number)) return toast.error(t("library.badNumber"))
    setBusy("save")
    try {
      await saveLibraryHymn(hymn, {
        title: form.title.trim(),
        hymnalId: form.hymnalId,
        number,
        label: form.label.trim() ? form.label.trim().toUpperCase() : null,
        author: form.author.trim(),
        language: form.language,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        repeatChorus: form.repeatChorus,
        status: form.status,
        ...(JSON.stringify(form.lyrics) !== JSON.stringify(saved.lyrics) ? { lyrics: cleanLyrics(form.lyrics) } : {}),
      })
      toast.success(t("library.saved"))
    } catch (e) {
      toast.error(t("library.failed"), { description: String((e as Error)?.message ?? e).slice(0, 300) })
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!confirm(t("library.deleteConfirm", { title: hymn.title }))) return
    setBusy("delete")
    try {
      await deleteLibraryHymn(hymn)
      toast.success(t("library.deleted"))
      onDeleted()
    } catch (e) {
      toast.error(t("library.failed"), { description: String((e as Error)?.message ?? e).slice(0, 300) })
      setBusy(null)
    }
  }

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center gap-3">
        <HymnArt hymnalId={form.hymnalId} className="size-10 rounded-lg" />
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">{t("library.edit")}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lib-title">{t("library.f.title")}</Label>
        <Input id="lib-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lib-hymnal">{t("library.f.hymnal")}</Label>
          <select id="lib-hymnal" value={form.hymnalId} onChange={(e) => set("hymnalId", e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {HYMNALS.map((h) => <option key={h.id} value={h.id}>{hymnal(h.id)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lib-number">{t("library.f.number")}</Label>
          <Input id="lib-number" inputMode="numeric" value={form.number} onChange={(e) => set("number", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lib-label">{t("library.f.label")}</Label>
          <Input id="lib-label" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="17B" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lib-author">{t("library.f.author")}</Label>
          <Input id="lib-author" value={form.author} onChange={(e) => set("author", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lib-lang">{t("library.f.language")}</Label>
          <select id="lib-lang" value={form.language} onChange={(e) => set("language", e.target.value as "es" | "en")} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="es">{t("library.lang.es")}</option>
            <option value="en">{t("library.lang.en")}</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lib-tags">{t("library.f.tags")}</Label>
        <Input id="lib-tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder={t("library.f.tagsHint")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("library.f.status")}</Label>
        <div className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label={t("library.f.status")}>
          {STATUSES.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={form.status === s}
              onClick={() => set("status", s)}
              className={cn("rounded-md px-1.5 py-1 text-muted-foreground", form.status === s && "bg-background font-medium text-foreground shadow-sm")}
            >
              {t(`library.status.${s}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("library.f.lyrics")}</Label>
        <p className="text-xs text-muted-foreground">{t("lyricsEditor.order")}</p>
        <LyricsEditor
          sections={form.lyrics}
          onChange={(lyrics) => set("lyrics", lyrics)}
          repeatChorus={form.repeatChorus}
          onRepeatChorusChange={(v) => set("repeatChorus", v)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={!dirty || !form.title.trim() || !!busy}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}{t("library.save")}</Button>
        <Button variant="outline" disabled={!local} title={local ? undefined : t("library.notLocal")} onClick={() => (studioHymns.select(slug!), go("review"))}><FolderOpen />{t("library.openInStudio")}</Button>
        <Button variant="outline" disabled={!!busy} onClick={() => setAttaching(true)}><Music />{hasNotes(hymn) ? t("attach.replaceNotes") : t("attach.addNotes")}</Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={!!busy} onClick={remove}>{busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}{t("library.delete")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{dirty ? t("library.unsaved") : t("library.footnote")}</p>
      {attaching && <AttachDialog target={hymn} onClose={() => setAttaching(false)} />}
    </Card>
  )
}

