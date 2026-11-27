import { BookOpen, ChevronRight, EyeOff, Loader2, Pencil, Plus, Trash2, WifiOff } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { canEditContent, canManageTeam, useAuth } from "@/lib/auth"
import { deleteHymnal, hymnalIdFrom, isBuiltIn, saveHymnal, useHymnals, type HymnalInput } from "@/lib/hymnals"
import { useHymns } from "@/lib/hymns"
import type { Hymnal, HymnStatus } from "@/lib/types"

const STATUS_ORDER: { status: HymnStatus; label: string; className: string }[] = [
  { status: "published", label: "Published", className: "bg-green-500" },
  { status: "draft", label: "Draft", className: "bg-zinc-300 dark:bg-zinc-600" },
  { status: "review", label: "In review", className: "bg-yellow-400" },
  { status: "hidden", label: "Hidden", className: "bg-red-400" },
]

export function HymnalsPage() {
  const { data, loading } = useHymns()
  const hymnals = useHymnals()
  const { role } = useAuth()
  const canEdit = canEditContent(role)
  const canDelete = canManageTeam(role)
  const [editing, setEditing] = useState<Hymnal | "new" | null>(null)

  return (
    <Page
      crumbs={[{ label: "Content" }, { label: "Hymnals" }]}
      title="Hymnals"
      description="Collections shown in the Himnario picker. Official hymnals are cached on the phone for offline use."
      actions={canEdit && <Button onClick={() => setEditing("new")}><Plus /> New hymnal</Button>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hymnals.map((hymnal) => {
          const hymns = data.filter((h) => h.hymnalId === hymnal.id)
          const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s.status, hymns.filter((h) => h.status === s.status).length]))
          const numbered = hymns.filter((h) => h.number != null).map((h) => h.number as number)
          const range = numbered.length ? `${Math.min(...numbered)}–${Math.max(...numbered)}` : "—"
          const noLyrics = hymns.filter((h) => h.lyrics.length === 0).length

          return (
            <Link key={hymnal.id} to={`/hymns?hymnal=${hymnal.id}`} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Card className="h-full transition-colors group-hover:border-foreground/30">
                <CardHeader className="flex flex-row items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#04C1FF] to-[#EEA246] text-white">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">{hymnal.name}</CardTitle>
                    <CardDescription>{hymnal.kind === "official" ? "Official hymnal" : "Composer uploads"}</CardDescription>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Edit ${hymnal.name}`}
                      onClick={(e) => {
                        e.preventDefault()
                        setEditing(hymnal)
                      }}
                    >
                      <Pencil />
                    </Button>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {loading ? (
                    <Skeleton className="h-16" />
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold tracking-tight">{hymns.length}</span>
                        <span className="text-sm text-muted-foreground">hymns · numbers {range}</span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        {STATUS_ORDER.map((s) =>
                          counts[s.status] ? (
                            <div key={s.status} className={s.className} style={{ width: `${(counts[s.status] / hymns.length) * 100}%` }} />
                          ) : null,
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {STATUS_ORDER.filter((s) => counts[s.status]).map((s) => (
                          <span key={s.status} className="flex items-center gap-1.5 text-muted-foreground">
                            <span className={`size-2 rounded-full ${s.className}`} />
                            {counts[s.status]} {s.label.toLowerCase()}
                          </span>
                        ))}
                        {hymns.length === 0 && <span className="text-muted-foreground">No hymns yet</span>}
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={hymnal.visible ? "secondary" : "destructive"} className="gap-1">{!hymnal.visible && <EyeOff />}{hymnal.visible ? "Visible in app" : "Hidden in app"}</Badge>
                    {hymnal.offline && (
                      <Badge variant="outline" className="gap-1">
                        <WifiOff /> Offline
                      </Badge>
                    )}
                    {!loading && noLyrics > 0 && <Badge variant="outline">{noLyrics} missing lyrics</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        Changes show in the app, the admin and Hymn Studio right away. The three built-in hymnals can be renamed or hidden but not deleted.
      </p>
      {editing && (
        <HymnalDialog
          hymnal={editing === "new" ? null : editing}
          hymnCount={editing === "new" ? 0 : data.filter((h) => h.hymnalId === editing.id).length}
          takenIds={hymnals.map((h) => h.id)}
          nextOrder={Math.max(0, ...hymnals.map((h) => h.order)) + 1}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

function HymnalDialog({ hymnal, hymnCount, takenIds, nextOrder, canDelete, onClose }: { hymnal: Hymnal | null; hymnCount: number; takenIds: string[]; nextOrder: number; canDelete: boolean; onClose: () => void }) {
  const isNew = !hymnal
  const [form, setForm] = useState<HymnalInput>(
    hymnal
      ? { name: hymnal.name, shortName: hymnal.shortName, color: hymnal.color, kind: hymnal.kind, visible: hymnal.visible, offline: hymnal.offline, order: hymnal.order }
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
      toast.error(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = { ...form, name: form.name.trim(), shortName: form.shortName.trim() || form.name.trim(), order: Math.max(0, Math.round(Number(form.order) || 0)) }
    void run(() => saveHymnal(id, clean, isNew), isNew ? `${clean.name} created` : "Hymnal saved")
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* (wider than the default 384px: the fields sit side by side) */}
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{isNew ? "New hymnal" : `Edit ${hymnal.name}`}</DialogTitle>
            <DialogDescription>{isNew ? "It appears in the app's hymnal picker once it's visible and has published hymns." : `${hymnCount} hymns · id ${hymnal.id}`}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="hn-name">Name</Label>
              <Input id="hn-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} required autoFocus />
              {isNew && form.name && <p className="text-xs text-muted-foreground">{idTaken ? "A hymnal with this name already exists." : `Id: ${id}`}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hn-short">Short name</Label>
              <Input id="hn-short" value={form.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder={form.name} maxLength={20} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_100px_90px] gap-3">
            <div className="grid gap-1.5">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v as Hymnal["kind"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">Official hymnal</SelectItem>
                  <SelectItem value="community">Composer uploads</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hn-color">Color</Label>
              <Input id="hn-color" type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-9 p-1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hn-order">Order</Label>
              <Input id="hn-order" type="number" min={0} step={1} value={form.order} onChange={(e) => set("order", Math.max(0, Number(e.target.value)))} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="hn-visible" className="flex-col items-start gap-0.5">Visible in the app<span className="text-xs font-normal text-muted-foreground">Hidden hymnals and their hymns don't show in the app.</span></Label>
            <Switch id="hn-visible" checked={form.visible} onCheckedChange={(v) => set("visible", v)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="hn-offline" className="flex-col items-start gap-0.5">Available offline<span className="text-xs font-normal text-muted-foreground">The app keeps a copy on the phone.</span></Label>
            <Switch id="hn-offline" checked={form.offline} onCheckedChange={(v) => set("offline", v)} />
          </div>
          <DialogFooter className="sm:justify-between">
            {deletable ? (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => confirm(`Delete ${hymnal.name}? This can't be undone.`) && void run(() => deleteHymnal(hymnal), "Hymnal deleted")}>
                <Trash2 /> Delete
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{!isNew && (isBuiltIn(hymnal.id) ? "Built-in hymnals can't be deleted." : hymnCount ? "Move or delete its hymns before deleting it." : "")}</span>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy || !form.name.trim() || !id || idTaken}>{busy && <Loader2 className="animate-spin" />}{isNew ? "Create hymnal" : "Save"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
