import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { HymnStatusBadge, STATUS_OPTIONS } from "@/components/hymn-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { canEditContent, useAuth } from "@/lib/auth"
import { HYMNALS } from "@/lib/hymnals"
import { saveHymn, useHymn, type HymnInput } from "@/lib/hymns"
import { parseLegacyLyrics, sectionLabel } from "@/lib/lyrics"
import type { LyricSection } from "@/lib/types"

const EMPTY: HymnInput = {
  number: null,
  title: "",
  hymnalId: "idc-himnario",
  language: "es",
  author: "",
  tags: [],
  lyrics: [{ type: "verse", number: 1, lines: [] }],
  repeatChorus: false,
  status: "draft",
}

/** Renumber verses 1..n in order so labels stay correct after edits. */
function renumber(sections: LyricSection[]): LyricSection[] {
  let n = 0
  return sections.map((s) => (s.type === "verse" ? { ...s, number: ++n } : { ...s, number: undefined }))
}

function toPlainText(sections: LyricSection[]) {
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
  return sections
    .map((s) => `${s.type === "verse" ? roman[(s.number ?? 1) - 1] ?? s.number : s.type === "chorus" ? "Coro" : "Puente"}\n${s.lines.join("\n")}`)
    .join("\n\n")
}

export function HymnEditorPage() {
  const { id } = useParams()
  const isNew = id === "new"
  const { data: hymn, loading } = useHymn(isNew ? undefined : id)
  const { role } = useAuth()
  const canEdit = canEditContent(role)
  const navigate = useNavigate()

  const [form, setForm] = useState<HymnInput>(EMPTY)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [mode, setMode] = useState<"blocks" | "text">("blocks")
  const [plain, setPlain] = useState("")
  const [tagDraft, setTagDraft] = useState("")
  const [saving, setSaving] = useState(false)

  // Load the stored hymn into the form once, so live updates don't clobber unsaved edits.
  useEffect(() => {
    if (hymn && hymn.id !== loadedId) {
      const { id: _id, createdAt: _c, updatedAt: _u, updatedBy: _b, recordingCount: _r, ...rest } = hymn
      setForm(rest)
      setLoadedId(hymn.id)
    }
  }, [hymn, loadedId])

  const set = <K extends keyof HymnInput>(key: K, value: HymnInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setSections = (fn: (s: LyricSection[]) => LyricSection[]) => setForm((f) => ({ ...f, lyrics: renumber(fn(f.lyrics)) }))

  function switchMode(next: "blocks" | "text") {
    if (next === "text") setPlain(toPlainText(form.lyrics))
    else setSections(() => parseLegacyLyrics(plain))
    setMode(next)
  }

  async function onSave() {
    const lyrics = mode === "text" ? renumber(parseLegacyLyrics(plain)) : form.lyrics
    const clean = { ...form, title: form.title.trim(), lyrics: lyrics.map((s) => ({ ...s, lines: s.lines.map((l) => l.trim()).filter(Boolean) })).filter((s) => s.lines.length) }
    if (!clean.title) return toast.error("Add a title before saving.")
    setSaving(true)
    try {
      const newId = await saveHymn(isNew ? null : id!, clean)
      toast.success(isNew ? "Hymn created" : "Changes saved")
      if (isNew) navigate(`/hymns/${newId}`, { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the hymn.")
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && loading) {
    return (
      <Page crumbs={[{ label: "Content" }, { label: "Hymns", to: "/hymns" }, { label: "…" }]} title={<Skeleton className="h-8 w-64" />}>
        <Skeleton className="h-96" />
      </Page>
    )
  }
  if (!isNew && !hymn) {
    return (
      <Page crumbs={[{ label: "Content" }, { label: "Hymns", to: "/hymns" }, { label: "Not found" }]} title="Hymn not found">
        <p className="text-muted-foreground">It may have been deleted.</p>
      </Page>
    )
  }

  const title = isNew ? "New hymn" : form.title || "Untitled hymn"

  return (
    <Page
      crumbs={[{ label: "Content" }, { label: "Hymns", to: "/hymns" }, { label: title }]}
      title={title}
      description={isNew ? "Starts as a draft. Publish when it's ready." : `${form.number != null ? `Hymn ${form.number} · ` : ""}${HYMNALS.find((h) => h.id === form.hymnalId)?.name ?? ""}`}
      actions={
        <>
          <HymnStatusBadge status={form.status} />
          {canEdit && (
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {isNew ? "Create hymn" : "Save changes"}
            </Button>
          )}
        </>
      }
    >
      <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Lyrics</CardTitle>
            <CardDescription>Blocks show in the app in this order.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => switchMode(v as "blocks" | "text")}>
              <div className="flex flex-wrap items-center gap-2">
                <TabsList>
                  <TabsTrigger value="blocks">Blocks</TabsTrigger>
                  <TabsTrigger value="text">Plain text</TabsTrigger>
                </TabsList>
                {mode === "blocks" && (
                  <div className="ml-auto flex gap-2">
                    {(["verse", "chorus", "bridge"] as const).map((t) => (
                      <Button key={t} type="button" size="sm" variant="outline" onClick={() => setSections((s) => [...s, { type: t, lines: [] }])}>
                        <Plus /> {t[0].toUpperCase() + t.slice(1)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <TabsContent value="blocks" className="mt-4 flex flex-col gap-3">
                {form.lyrics.map((s, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={s.type === "chorus" ? "default" : "secondary"}>{sectionLabel(s)}</Badge>
                      <div className="ml-auto flex">
                        <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === 0} aria-label="Move up" onClick={() => setSections((all) => { const n = [...all]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === form.lyrics.length - 1} aria-label="Move down" onClick={() => setSections((all) => { const n = [...all]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })}>
                          <ArrowDown />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Remove block" onClick={() => setSections((all) => all.filter((_, j) => j !== i))}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={s.lines.join("\n")}
                      onChange={(e) => {
                        const lines = e.target.value.split("\n")
                        setSections((all) => all.map((x, j) => (j === i ? { ...x, lines } : x)))
                      }}
                      rows={Math.max(3, s.lines.length)}
                      placeholder="One line per row"
                      className="leading-relaxed"
                    />
                  </div>
                ))}
                {form.lyrics.length === 0 && <p className="text-sm text-muted-foreground">No blocks yet. Add a verse to start.</p>}
                <div className="flex items-center gap-2">
                  <Switch id="repeat" checked={form.repeatChorus} onCheckedChange={(v) => set("repeatChorus", v)} />
                  <Label htmlFor="repeat">Repeat chorus after each verse</Label>
                </div>
              </TabsContent>
              <TabsContent value="text" className="mt-4 flex flex-col gap-2">
                <Textarea value={plain} onChange={(e) => setPlain(e.target.value)} rows={18} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Mark verses with I, II, III on their own line and the chorus with "Coro". Switching back to Blocks splits it automatically.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="flex w-24 flex-col gap-2">
                  <Label htmlFor="number">Number</Label>
                  <Input id="number" inputMode="numeric" value={form.number ?? ""} onChange={(e) => set("number", e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")))} />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Hymnal</Label>
                  <Select value={form.hymnalId} onValueChange={(v) => set("hymnalId", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HYMNALS.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Language</Label>
                  <Select value={form.language} onValueChange={(v) => set("language", v as "es" | "en")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="author">Author / composer</Label>
                <Input id="author" value={form.author} onChange={(e) => set("author", e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tag">Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", form.tags.filter((x) => x !== t))}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  id="tag"
                  value={tagDraft}
                  placeholder="Type a tag and press Enter"
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagDraft.trim()) {
                      e.preventDefault()
                      if (!form.tags.includes(tagDraft.trim())) set("tags", [...form.tags, tagDraft.trim()])
                      setTagDraft("")
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v as HymnInput["status"])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Only Published hymns appear in the app.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recordings</CardTitle>
              <CardDescription>Audio uploads arrive with the composer studio.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {isNew ? "Save the hymn first." : `${hymn?.recordingCount ?? 0} recording(s)`}
            </CardContent>
          </Card>
        </div>
      </fieldset>
    </Page>
  )
}
