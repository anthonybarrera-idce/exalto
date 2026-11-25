import { AlertTriangle, Check, CloudUpload, Loader2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { PageId } from "@/App"
import { NotesBadge, TargetPicker, useLibraryHymns, useLocalDetails, useStatusLabel, useWhere, WhyBadge } from "@/components/attach-dialog"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { useLocale } from "@/hooks/use-locale"
import { attachNotes, hasNotes, isStrongMatch, suggestMatches, type Match } from "@/lib/attach"
import type { LibraryHymn } from "@/lib/library"
import type { HymnDetail } from "@/lib/studio"
import { cn } from "@/lib/utils"
import { openLibraryAt } from "@/pages/library"

type RowState = "idle" | "waiting" | "uploading" | "done" | "failed"
type Row = { slug: string; targetId: string | null; match?: Match; selected: boolean; state: RowState; progress: number; error?: string }

/**
 * Bulk mode: every converted hymn on this Mac that has a score, auto-matched to an existing hymn in Exalto.
 * The user confirms each match, then a confirmation lists exactly which hymns change before anything is written.
 * Lyrics are always kept in bulk; to replace lyrics, use the single-hymn dialog.
 */
export function AttachPage({ go }: { go: (p: PageId) => void }) {
  const { t } = useLocale()
  const where = useWhere()
  const statusLabel = useStatusLabel()
  const { hymns, error } = useLibraryHymns()
  const { details, lyricsOnly } = useLocalDetails()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)

  // Auto-match once both lists are in; keep the user's choices when the lists refresh.
  useEffect(() => {
    if (!details || !hymns) return
    setRows((prev) =>
      details.map((d) => {
        const old = prev?.find((r) => r.slug === d.slug)
        if (old) return old
        const match = suggestMatches(d.hymn, hymns, 1)[0]
        const target = match?.hymn
        return { slug: d.slug, targetId: target?.id ?? null, match, selected: isStrongMatch(match) && !hasNotes(target!), state: "idle", progress: 0 }
      }),
    )
  }, [details, hymns])

  const byId = useMemo(() => new Map((hymns ?? []).map((h) => [h.id, h])), [hymns])
  const detailOf = (slug: string) => details?.find((d) => d.slug === slug)
  const update = (slug: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.slug === slug ? { ...r, ...patch } : r)))

  const selected = (rows ?? []).filter((r) => r.selected && r.targetId && byId.has(r.targetId))
  const dupes = new Set(selected.map((r) => r.targetId!).filter((id, i, a) => a.indexOf(id) !== i))
  const withNotes = (hymns ?? []).filter(hasNotes).length

  const pick = (slug: string, h: LibraryHymn) => {
    const d = detailOf(slug)!
    const m = suggestMatches(d.hymn, [h], 1)[0]
    update(slug, { targetId: h.id, match: m, selected: true, state: "idle" })
    setEditing(null)
  }

  const runAll = async () => {
    setConfirming(false)
    setRunning(true)
    const queue = selected.map((r) => r.slug)
    for (const slug of queue) update(slug, { state: "waiting", progress: 0, error: undefined })
    let failed = 0
    for (const slug of queue) {
      const row = rows!.find((r) => r.slug === slug)!
      const target = byId.get(row.targetId!)!
      const detail = detailOf(slug)!
      update(slug, { state: "uploading" })
      try {
        await attachNotes(detail, target, { replaceLyrics: false }, (steps) =>
          update(slug, { progress: steps.reduce((n, s) => n + (s.done ? 1 : s.progress), 0) / steps.length }),
        )
        update(slug, { state: "done", progress: 1, selected: false })
      } catch (e) {
        failed++
        update(slug, { state: "failed", error: String((e as Error)?.message ?? e).slice(0, 200) })
      }
    }
    setRunning(false)
    if (failed) toast.error(t("bulk.someFailed", { failed, count: queue.length }))
    else toast.success(t("bulk.allDone", { count: queue.length }))
  }

  return (
    <>
      <PageHeader title={t("bulk.title")} sub={t("bulk.sub")}>
        <Button variant="outline" onClick={() => openLibraryAt("nonotes", go)}>{t("bulk.seeMissing")}</Button>
      </PageHeader>

      {hymns && (
        <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Progress value={(withNotes / Math.max(1, hymns.length)) * 100} className="h-1.5 w-40" />
          {t("bulk.progress", { withNotes, total: hymns.length, left: hymns.length - withNotes })}
        </div>
      )}

      {error ? (
        <Card className="p-5 text-sm"><div className="font-medium">{t("bulk.loadError")}</div><p className="text-muted-foreground">{error}</p></Card>
      ) : !rows ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("attach.loading")}</div>
      ) : !rows.length ? (
        <Card className="p-5 text-sm text-muted-foreground">{t("bulk.empty")}</Card>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("bulk.selected", { count: selected.length })}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={running}
              onClick={() => setRows((rs) => rs!.map((r) => ({ ...r, selected: r.state !== "done" && isStrongMatch(r.match) && !!r.targetId && !hasNotes(byId.get(r.targetId)!) })))}
            >
              {t("bulk.selectStrong")}
            </Button>
            <Button variant="ghost" size="sm" disabled={running} onClick={() => setRows((rs) => rs!.map((r) => ({ ...r, selected: false })))}>{t("bulk.clear")}</Button>
            <Button className="ml-auto" disabled={running || !selected.length || dupes.size > 0} onClick={() => setConfirming(true)}>
              {running ? <Loader2 className="animate-spin" /> : <CloudUpload />}
              {t("bulk.upload", { count: selected.length })}
            </Button>
          </div>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="grid grid-cols-[28px_1fr_1.3fr_150px_96px] gap-3 border-b bg-sidebar px-4 py-2 text-xs font-medium text-muted-foreground">
              <span /><span>{t("bulk.col.converted")}</span><span>{t("bulk.col.target")}</span><span>{t("bulk.col.match")}</span><span />
            </div>
            {rows.map((r) => {
              const d = detailOf(r.slug)
              const target = r.targetId ? byId.get(r.targetId) : undefined
              if (!d) return null
              return (
                <div key={r.slug} className="border-b border-muted last:border-b-0">
                  <div className="grid grid-cols-[28px_1fr_1.3fr_150px_96px] items-center gap-3 px-4 py-2.5">
                    <Checkbox checked={r.selected} disabled={running || !target || r.state === "done"} onCheckedChange={(c) => update(r.slug, { selected: !!c })} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{d.hymn.title || d.review.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{where(d.hymn)}</div>
                    </div>
                    <div className="min-w-0">
                      {target ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium">{target.title}</span>
                            <NotesBadge has={hasNotes(target)} />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{where(target)} · {statusLabel(target.status)}</div>
                          {hasNotes(target) && r.state !== "done" && <div className="text-xs text-amber-700 dark:text-amber-300">{t("bulk.existingNotes")}</div>}
                          {r.selected && dupes.has(target.id) && <div className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" />{t("bulk.duplicate")}</div>}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("bulk.noMatch")}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.match && target && r.match.hymn.id === target.id && <WhyBadge why={r.match.why} />}
                      {!running && r.state !== "done" && (
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditing(editing === r.slug ? null : r.slug)}>
                          {target ? t("attach.change") : t("bulk.choose")}
                        </Button>
                      )}
                    </div>
                    <div className="text-xs">
                      {r.state === "uploading" ? (
                        <Progress value={r.progress * 100} className="h-1.5" />
                      ) : r.state === "done" ? (
                        <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><Check className="size-3.5" />{t("bulk.state.done")}</span>
                      ) : r.state === "failed" ? (
                        <span className="flex items-center gap-1 text-destructive" title={r.error}><X className="size-3.5" />{t("bulk.state.failed")}</span>
                      ) : r.state === "waiting" ? (
                        <span className="text-muted-foreground">{t("bulk.state.waiting")}</span>
                      ) : null}
                    </div>
                  </div>
                  {editing === r.slug && hymns && (
                    <div className="border-t bg-muted/30 px-4 py-3">
                      <TargetPicker want={d.hymn} hymns={hymns} pickedId={r.targetId} onPick={(h) => pick(r.slug, h)} />
                      {target && (
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => (update(r.slug, { targetId: null, match: undefined, selected: false }), setEditing(null))}>
                          {t("bulk.skip")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
          {lyricsOnly > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("bulk.lyricsOnlyCount", { count: lyricsOnly })}</p>}
        </>
      )}

      {confirming && (
        <ConfirmBulk
          rows={selected.map((r) => ({ detail: detailOf(r.slug)!, target: byId.get(r.targetId!)! }))}
          onCancel={() => setConfirming(false)}
          onGo={runAll}
          label={(h) => `${where(h)} · ${statusLabel(h.status)}`}
        />
      )}
    </>
  )
}

/** The required confirmation before a bulk write to production: exactly which hymns will change. */
function ConfirmBulk({
  rows,
  onCancel,
  onGo,
  label,
}: {
  rows: { detail: HymnDetail; target: LibraryHymn }[]
  onCancel: () => void
  onGo: () => void
  label: (h: LibraryHymn) => string
}) {
  const { t } = useLocale()
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <Card role="alertdialog" aria-modal className="flex max-h-[85vh] w-[640px] max-w-full flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 py-4">
          <div className="text-base font-semibold">{t("bulk.confirmTitle", { count: rows.length })}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("bulk.confirmBody")}</p>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {rows.map(({ detail, target }) => (
            <li key={detail.slug} className="flex items-center gap-3 border-b py-2 text-[13px] last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{target.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{label(target)}</span>
              </span>
              <span className={cn("text-xs", hasNotes(target) ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                {hasNotes(target) ? t("attach.willReplace") : t("attach.willAdd")}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onCancel}>{t("attach.cancel")}</Button>
          <Button onClick={onGo}><CloudUpload />{t("bulk.confirmGo", { count: rows.length })}</Button>
        </div>
      </Card>
    </div>
  )
}
