import { ChevronRight, EyeOff, Loader2, Pencil, Plus, Trash2, WifiOff } from "lucide-react"
import { HymnArt } from "@/components/hymn-art"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/hooks/use-auth"
import { useLocale } from "@/hooks/use-locale"
import { deleteHymnal, hymnalIdFrom, isBuiltIn, saveHymnal, useAllHymnals, useHymnals, type Hymnal, type HymnalInput } from "@/lib/hymnals"
import { watchLibrary, type HymnStatus, type LibraryHymn } from "@/lib/library"
import { openLibraryAt } from "@/pages/library"

const STATUS_ORDER: { status: HymnStatus; className: string }[] = [
  { status: "published", className: "bg-green-500" },
  { status: "draft", className: "bg-zinc-300 dark:bg-zinc-600" },
  { status: "review", className: "bg-sky-400" },
  { status: "hidden", className: "bg-red-400" },
]

/** Owners, admins and editors: the hymnals in the app's picker, with their hymn counts, and editing them. */
export function HymnalsPage({ go }: { go: (p: PageId) => void }) {
  const { t, hymnal, num } = useLocale()
  const hymnals = useHymnals()
  const allHymnals = useAllHymnals()
  const { role, composer } = useAuth()
  // Composers see only their own hymnals (useHymnals), so they may delete any of them once empty.
  const canDelete = role === "owner" || role === "admin" || composer
  const [hymns, setHymns] = useState<LibraryHymn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Hymnal | "new" | null>(null)
  useEffect(() => watchLibrary(setHymns, (e) => setError(e.message)), [])

  return (
    <>
      <PageHeader title={t("hymnals.title")} sub={t(composer ? "hymnals.composerSub" : "hymnals.sub")}>
        <Button onClick={() => setEditing("new")}><Plus />{t("hymnals.new")}</Button>
      </PageHeader>
      {error && <Card className="mb-4 p-5 text-sm"><div className="font-medium">{t("library.loadError")}</div><p className="text-muted-foreground">{error}</p></Card>}
      {editing && (
        <HymnalEditor
          key={editing === "new" ? "new" : editing.id}
          hymnal={editing === "new" ? null : editing}
          hymnCount={editing === "new" ? 0 : (hymns ?? []).filter((h) => h.hymnalId === editing.id).length}
          takenIds={allHymnals.map((h) => h.id)}
          nextOrder={Math.max(0, ...allHymnals.map((h) => h.order)) + 1}
          canDelete={canDelete}
          composer={composer}
          onClose={() => setEditing(null)}
        />
      )}
      {composer && hymnals.length === 0 && !editing && (
        <Card className="mb-4 flex-row items-center gap-3 p-5 text-sm">
          <p className="flex-1 text-muted-foreground">{t("hymnals.composerEmpty")}</p>
          <Button onClick={() => setEditing("new")}><Plus />{t("hymnals.new")}</Button>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {hymnals.map((hm) => {
          const list = (hymns ?? []).filter((h) => h.hymnalId === hm.id)
          const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s.status, list.filter((h) => h.status === s.status).length])) as Record<HymnStatus, number>
          const numbered = list.filter((h) => h.number != null).map((h) => h.number as number)
          const range = numbered.length ? `${Math.min(...numbered)}–${Math.max(...numbered)}` : "—"
          const noLyrics = list.filter((h) => h.lyrics.length === 0).length
          return (
            <Card key={hm.id} className="gap-4 p-5">
              <div className="flex items-start gap-3">
                <HymnArt hymnalId={hm.id} className="size-10 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{hymnal(hm.id)}</div>
                  <div className="text-sm text-muted-foreground">{t(hm.kind === "official" ? "hymnals.official" : "hymnals.community")}</div>
                </div>
                <Button variant="ghost" size="icon" className="size-8" aria-label={t("hymnals.editLabel", { name: hm.name })} onClick={() => setEditing(hm)}><Pencil /></Button>
              </div>
              {!hymns ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight">{num(list.length)}</span>
                    <span className="text-sm text-muted-foreground">{t("hymnals.count", { range })}</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {STATUS_ORDER.map((s) => (counts[s.status] ? <div key={s.status} className={s.className} style={{ width: `${(counts[s.status] / list.length) * 100}%` }} /> : null))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {STATUS_ORDER.filter((s) => counts[s.status]).map((s) => (
                      <span key={s.status} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className={`size-2 rounded-full ${s.className}`} />
                        {counts[s.status]} {t(`library.status.${s.status}`).toLowerCase()}
                      </span>
                    ))}
                    {list.length === 0 && <span className="text-muted-foreground">{t("hymnals.empty")}</span>}
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={hm.visible ? "secondary" : "destructive"} className="gap-1">{!hm.visible && <EyeOff />}{t(hm.visible ? "hymnals.visible" : "hymnals.hidden")}</Badge>
                {hm.offline && <Badge variant="outline" className="gap-1"><WifiOff /> {t("hymnals.offline")}</Badge>}
                {hymns && noLyrics > 0 && <Badge variant="outline">{t("hymnals.missingLyrics", { count: noLyrics })}</Badge>}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => openLibraryAt(hm.id, go)}>{t("hymnals.openHymns")}<ChevronRight /></Button>
              </div>
            </Card>
          )
        })}
      </div>
      {!composer && <p className="mt-4 text-sm text-muted-foreground">{t("hymnals.footnote")}</p>}
    </>
  )
}

function HymnalEditor({ hymnal, hymnCount, takenIds, nextOrder, canDelete, composer, onClose }: { hymnal: Hymnal | null; hymnCount: number; takenIds: string[]; nextOrder: number; canDelete: boolean; composer: boolean; onClose: () => void }) {
  const { t } = useLocale()
  const isNew = !hymnal
  const [form, setForm] = useState<HymnalInput>(
    hymnal
      ? { name: hymnal.name, shortName: hymnal.shortName, color: hymnal.color, kind: hymnal.kind, visible: hymnal.visible, offline: hymnal.offline, order: hymnal.order }
      : composer
        ? { name: "", shortName: "", color: "#4A2E6B", kind: "community", visible: true, offline: false, order: nextOrder }
        : { name: "", shortName: "", color: "#4A2E6B", kind: "official", visible: true, offline: true, order: nextOrder },
  )
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof HymnalInput>(k: K, v: HymnalInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const id = hymnal?.id ?? hymnalIdFrom(form.name)
  const idTaken = isNew && takenIds.includes(id)
  const deletable = !isNew && canDelete && !isBuiltIn(hymnal.id) && hymnCount === 0

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      onClose()
    } catch (e) {
      toast.error(t("hymnals.failed"), { description: String((e as Error)?.message ?? e).slice(0, 300) })
      setBusy(false)
    }
  }
  const save = () => {
    const clean = { ...form, name: form.name.trim(), shortName: form.shortName.trim() || form.name.trim(), order: Math.max(0, Math.round(Number(form.order) || 0)) }
    void run(() => saveHymnal(id, clean, isNew), isNew ? t("hymnals.created", { name: clean.name }) : t("hymnals.saved"))
  }

  return (
    <Card className="mb-5 gap-4 p-5">
      <div>
        <div className="text-sm font-semibold">{isNew ? t("hymnals.new") : t("hymnals.editLabel", { name: hymnal.name })}</div>
        <p className="text-xs text-muted-foreground">{isNew ? t("hymnals.newHelp") : t("hymnals.editHelp", { count: hymnCount, id: hymnal.id })}</p>
      </div>
      <div className={composer ? "grid grid-cols-[1fr_160px_80px_80px] items-start gap-3" : "grid grid-cols-[1fr_160px_150px_80px_80px] items-start gap-3"}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hn-name">{t("hymnals.f.name")}</Label>
          <Input id="hn-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} autoFocus />
          {isNew && form.name && <p className="text-xs text-muted-foreground">{idTaken ? t("hymnals.idTaken") : t("hymnals.id", { id })}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hn-short">{t("hymnals.f.shortName")}</Label>
          <Input id="hn-short" value={form.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder={form.name} maxLength={20} />
        </div>
        <div className={composer ? "hidden" : "flex flex-col gap-1.5"}>
          <Label htmlFor="hn-kind">{t("hymnals.f.kind")}</Label>
          <select id="hn-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as Hymnal["kind"])} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="official">{t("hymnals.official")}</option>
            <option value="community">{t("hymnals.community")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hn-color">{t("hymnals.f.color")}</Label>
          <div className="flex gap-2">
            <HymnArt color={form.color} className="size-9 rounded-md" />
            <Input id="hn-color" type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-9 min-w-0 flex-1 p-1" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hn-order">{t("hymnals.f.order")}</Label>
          <Input id="hn-order" type="number" min={0} step={1} value={form.order} onChange={(e) => set("order", Math.max(0, Number(e.target.value)))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span><span className="block font-medium">{t("hymnals.f.visible")}</span><span className="text-xs text-muted-foreground">{t("hymnals.f.visibleHelp")}</span></span>
          <Switch checked={form.visible} onCheckedChange={(v) => set("visible", v)} />
        </label>
        <label className={composer ? "hidden" : "flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"}>
          <span><span className="block font-medium">{t("hymnals.f.offline")}</span><span className="text-xs text-muted-foreground">{t("hymnals.f.offlineHelp")}</span></span>
          <Switch checked={form.offline} onCheckedChange={(v) => set("offline", v)} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        {deletable ? (
          <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => confirm(t("hymnals.deleteConfirm", { name: hymnal.name })) && void run(() => deleteHymnal(hymnal), t("hymnals.deleted"))}>
            <Trash2 />{t("hymnals.delete")}
          </Button>
        ) : (
          !isNew && <span className="text-xs text-muted-foreground">{isBuiltIn(hymnal.id) ? t("hymnals.builtIn") : hymnCount ? t("hymnals.notEmpty") : canDelete ? "" : t("hymnals.deleteRole")}</span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.discard")}</Button>
          <Button onClick={save} disabled={busy || !form.name.trim() || !id || idTaken}>{busy && <Loader2 className="animate-spin" />}{isNew ? t("hymnals.create") : t("library.save")}</Button>
        </div>
      </div>
    </Card>
  )
}
