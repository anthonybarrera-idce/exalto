import { ArrowRight, Check, CloudUpload, Loader2, Minus, Music, Plus, RefreshCw, Search, X } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useLocale } from "@/hooks/use-locale"
import { useStudio } from "@/hooks/use-studio"
import {
  attachNotes,
  diffLyrics,
  filesToAdd,
  hasNotes,
  isAttachable,
  readTarget,
  sameLyrics,
  searchHymns,
  suggestLocal,
  suggestMatches,
  type Match,
  type TargetNow,
} from "@/lib/attach"
import { useHymnals } from "@/lib/hymnals"
import type { StringKey } from "@/lib/i18n"
import { STATUSES, watchLibrary, type HymnStatus, type LibraryHymn } from "@/lib/library"
import { studio, type HymnDetail } from "@/lib/studio"
import type { UploadStep } from "@/lib/upload"
import { VOICES, type Voice } from "@/lib/notes"
import { cn } from "@/lib/utils"
import { hymnNumberText } from "@/lib/hymn-number"

// ---- Shared bits (also used by pages/attach.tsx) ----

/** Every hymn in Exalto, live. */
export function useLibraryHymns() {
  const [hymns, setHymns] = useState<LibraryHymn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => watchLibrary(setHymns, (e) => setError(e.message)), [])
  return { hymns, error }
}

/** Converted hymns on this Mac that have a score, with their details (hymnal, number, lyrics). */
export function useLocalDetails() {
  const { hymns } = useStudio()
  const [details, setDetails] = useState<HymnDetail[] | null>(null)
  const attachable = hymns.filter(isAttachable)
  const key = attachable.map((h) => `${h.slug}:${h.updatedAt}`).join("|")
  useEffect(() => {
    let live = true
    Promise.all(attachable.map((h) => studio.getHymn(h.slug) as Promise<HymnDetail>)).then((d) => live && setDetails(d.filter(Boolean)))
    return () => void (live = false)
  }, [key])
  return { details, lyricsOnly: hymns.length - attachable.length }
}

export function useStatusLabel() {
  const { t } = useLocale()
  return (s: string) => (STATUSES.includes(s as HymnStatus) ? t(`library.status.${s as HymnStatus}`) : s)
}

export function NotesBadge({ has }: { has: boolean }) {
  const { t } = useLocale()
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        has ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
      )}
    >
      <Music className="size-3" />
      {has ? t("attach.hasNotes") : t("attach.noNotes")}
    </span>
  )
}

export function WhyBadge({ why }: { why: Match["why"] }) {
  const { t } = useLocale()
  return <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-sky-100 px-2 text-xs whitespace-nowrap text-sky-800 dark:bg-sky-950 dark:text-sky-300">{t(`attach.why.${why}`)}</span>
}

/** "Hymn 123 · IDC Himnario" */
export function useWhere() {
  const { t, hymnal } = useLocale()
  return (h: { number: number | null; label?: string | null; hymnalId: string }) =>
    h.number != null || h.label ? t("attach.target", { number: hymnNumberText(h) ?? "", hymnal: hymnal(h.hymnalId) }) : t("attach.targetNoNumber", { hymnal: hymnal(h.hymnalId) })
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Card role="dialog" aria-modal className="flex max-h-[88vh] w-[760px] max-w-full flex-col gap-0 overflow-hidden p-0">
        {children}
      </Card>
    </div>
  )
}

// ---- Picking the existing hymn ----

/** Suggestions from the converted hymn's title/number/hymnal, plus a search by number or title (accents ignored). */
export function TargetPicker({ want, hymns, onPick, pickedId }: { want: HymnDetail["hymn"]; hymns: LibraryHymn[]; onPick: (h: LibraryHymn) => void; pickedId?: string | null }) {
  const { t, hymnal } = useLocale()
  const HYMNALS = useHymnals()
  const where = useWhere()
  const [q, setQ] = useState("")
  const [hymnalId, setHymnalId] = useState<string>(want.hymnalId && want.hymnalId !== "community" ? want.hymnalId : "")
  const suggestions = useMemo(() => suggestMatches(want, hymns), [want, hymns])
  const results = useMemo(() => searchHymns(hymns, q, hymnalId || null), [hymns, q, hymnalId])
  const row = (h: LibraryHymn, why?: Match["why"]) => (
    <button
      key={h.id}
      onClick={() => onPick(h)}
      className={cn("flex w-full items-center gap-3 border-b border-muted px-3 py-2 text-left last:border-b-0 hover:bg-accent/60", pickedId === h.id && "bg-sidebar-accent")}
    >
      <span className="w-10 shrink-0 text-[13px] font-medium text-foreground/80 tabular-nums">{hymnNumberText(h) ?? "—"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{h.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{where(h)}</span>
      </span>
      {why && <WhyBadge why={why} />}
      <NotesBadge has={hasNotes(h)} />
    </button>
  )
  return (
    <div className="flex flex-col gap-3">
      {suggestions.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("attach.suggested")}</div>
          <div className="rounded-lg border">{suggestions.map((m) => row(m.hymn, m.why))}</div>
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("attach.search")} className="h-8 pl-8 text-xs" />
        </div>
        <select value={hymnalId} onChange={(e) => setHymnalId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="">{t("attach.anyHymnal")}</option>
          {HYMNALS.map((h) => <option key={h.id} value={h.id}>{hymnal(h.id)}</option>)}
        </select>
      </div>
      {q.trim() && (results.length ? <div className="max-h-64 overflow-y-auto rounded-lg border">{results.map((h) => row(h))}</div> : <p className="text-xs text-muted-foreground">{t("attach.noMatches")}</p>)}
    </div>
  )
}

// ---- Before / after and lyrics ----

function Line({ kind, icon, children }: { kind: "add" | "replace" | "keep"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13px]">
      <span className={cn("flex size-4 items-center justify-center", kind === "keep" ? "text-muted-foreground" : kind === "add" ? "text-green-600" : "text-amber-600")}>
        {icon ?? (kind === "keep" ? <Minus className="size-3.5" /> : kind === "add" ? <Plus className="size-3.5" /> : <RefreshCw className="size-3.5" />)}
      </span>
      {children}
    </div>
  )
}

function BeforeAfter({ detail, now, replaceLyrics }: { detail: HymnDetail; now: TargetNow; replaceLyrics: boolean }) {
  const { t, voiceName } = useLocale()
  const statusLabel = useStatusLabel()
  const add = filesToAdd(detail)
  const kind = (had: boolean) => (had ? "replace" : "add") as "add" | "replace"
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border p-3">
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{now.hasScore ? t("attach.willReplace") : t("attach.willAdd")}</div>
        {add.score && <Line kind={kind(now.hasScore)}>{t("attach.f.score")}</Line>}
        {add.audio && <Line kind={kind(now.hasAudio)}>{t("attach.f.piano")}</Line>}
        {add.voices.length > 0 && <Line kind={kind(now.voices.length > 0)}>{t("attach.f.voices", { voices: add.voices.map((v) => voiceName(v as Voice)).join(", ") })}</Line>}
        {add.practice && <Line kind={kind(now.hasPractice)}>{t("attach.f.practice")}</Line>}
        {replaceLyrics && <Line kind="replace">{t("attach.f.lyricsReplaced")}</Line>}
      </div>
      <div className="rounded-lg border p-3">
        <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("attach.untouched")}</div>
        <Line kind="keep">{t("attach.f.details")}</Line>
        <Line kind="keep">{t("attach.f.status", { status: statusLabel(now.status) })}</Line>
        {!replaceLyrics && <Line kind="keep">{t("attach.f.lyrics")}</Line>}
      </div>
    </div>
  )
}

function LyricsChoice({ detail, now, replace, setReplace }: { detail: HymnDetail; now: TargetNow; replace: boolean; setReplace: (v: boolean) => void }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const same = sameLyrics(now.lyrics, detail.hymn.lyrics)
  const diff = useMemo(() => diffLyrics(now.lyrics, detail.hymn.lyrics), [now.lyrics, detail.hymn.lyrics])
  const changed = diff.reduce((n, s) => n + s.lines.filter((l) => l.kind !== "same").length, 0)
  const sectionName = (l: { type: string; number?: number }) =>
    l.type === "verse" ? (l.number ? t("lyricsEditor.verseN", { n: l.number }) : t("lyricsEditor.verse")) : l.type === "chorus" ? t("lyricsEditor.chorus") : t("lyricsEditor.bridge")
  const option = (value: boolean, title: StringKey, hint: StringKey) => (
    <label className={cn("flex flex-1 cursor-pointer items-start gap-2 rounded-lg border p-3", replace === value && "border-foreground/40 bg-accent/40")}>
      <input type="radio" name="lyrics" className="mt-1" checked={replace === value} onChange={() => setReplace(value)} />
      <span>
        <span className="block text-[13px] font-medium">{t(title)}</span>
        <span className="block text-xs text-muted-foreground">{t(hint)}</span>
      </span>
    </label>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{t("attach.lyrics")}</span>
        <span className="text-muted-foreground">{same ? t("attach.lyricsSame") : t("attach.lyricsDiffer", { count: changed })}</span>
        {!same && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen((o) => !o)}>
            {open ? t("attach.hideDiff") : t("attach.showDiff")}
          </Button>
        )}
      </div>
      {!same && (
        <div className="flex gap-2">
          {option(false, "attach.keepLyrics", "attach.keepLyricsHint")}
          {option(true, "attach.replaceLyrics", "attach.replaceLyricsHint")}
        </div>
      )}
      {open && !same && (
        <div className="max-h-72 overflow-y-auto rounded-lg border text-xs">
          <div className="sticky top-0 grid grid-cols-2 gap-3 border-b bg-sidebar px-3 py-1.5 font-medium text-muted-foreground">
            <span>{t("attach.diff.existing")}</span>
            <span>{t("attach.diff.converted")}</span>
          </div>
          {diff.map((s, i) => (
            <div key={i} className="border-b px-3 py-2 last:border-b-0">
              <div className="mb-1 font-semibold text-muted-foreground">{sectionName(s.label)}</div>
              {s.lines.map((l, j) => (
                <div key={j} className={cn("grid grid-cols-2 gap-3 rounded px-1", l.kind !== "same" && "bg-amber-50 dark:bg-amber-950/40")}>
                  <span className={cn(l.kind === "added" && "text-muted-foreground")}>{l.before ?? "—"}</span>
                  <span className={cn(l.kind === "removed" && "text-muted-foreground")}>{l.after ?? "—"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function StepList({ steps, busy }: { steps: UploadStep[]; busy: boolean }) {
  const { t, voiceName } = useLocale()
  const KEYS: Record<string, StringKey> = {
    "Piano · all voices": "upload.step.audio",
    "Score (MusicXML)": "upload.step.score",
    "Practice notes": "upload.step.practice",
    "Link to hymn": "attach.step.link",
  }
  const label = (l: string) => {
    const voice = /^Piano · (\w+)$/.exec(l)?.[1]
    if (KEYS[l]) return t(KEYS[l])
    return VOICES.includes(voice as Voice) ? t("upload.step.voice", { voice: voiceName(voice as Voice) }) : l
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-xs">
          {s.done ? <Check className="size-3.5 text-green-600" /> : <Loader2 className={busy ? "size-3.5 animate-spin" : "size-3.5"} />}
          <span className="w-40 truncate">{label(s.label)}</span>
          <Progress value={s.progress * 100} className="h-1.5 flex-1" />
        </div>
      ))}
    </div>
  )
}

// ---- The dialog ----

type Props =
  /** From a converted hymn (Export): pick the existing hymn. */
  | { slug: string; target?: undefined; onClose: () => void }
  /** From the library (a hymn without notes): pick the converted hymn. */
  | { target: LibraryHymn; slug?: undefined; onClose: () => void }

/** Attach a converted score to one existing hymn, with a before/after and a lyrics choice. */
export function AttachDialog(props: Props) {
  const { t } = useLocale()
  const where = useWhere()
  const statusLabel = useStatusLabel()
  const { hymns, error } = useLibraryHymns()
  const { details } = useLocalDetails()
  const [slug, setSlug] = useState<string | null>(props.slug ?? null)
  const [targetId, setTargetId] = useState<string | null>(props.target?.id ?? null)
  const [detail, setDetail] = useState<HymnDetail | null>(null)
  const [now, setNow] = useState<TargetNow | null>(null)
  const [replaceLyrics, setReplaceLyrics] = useState(false)
  const [steps, setSteps] = useState<UploadStep[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const close = () => !busy && props.onClose()

  useEffect(() => {
    setDetail(null)
    if (slug) studio.getHymn(slug).then(setDetail)
  }, [slug])
  useEffect(() => {
    setNow(null)
    setReplaceLyrics(false)
    if (targetId) readTarget(targetId).then(setNow, (e) => toast.error(t("attach.failed"), { description: String(e?.message ?? e) }))
  }, [targetId])

  const target = hymns?.find((h) => h.id === targetId) ?? props.target ?? null
  const choosingTarget = !!slug && !targetId
  const choosingLocal = !!targetId && !slug && !!props.target

  const run = async () => {
    if (!detail || !target || !now) return
    if (now.hasScore && !confirm(t("attach.confirmReplace", { title: now.title }))) return
    setBusy(true)
    try {
      const r = await attachNotes(detail, target, { replaceLyrics }, setSteps)
      toast.success(t("attach.done", { title: now.title }), { description: t("attach.doneSub", { status: statusLabel(r.status) }) })
      setDone(true)
    } catch (e) {
      toast.error(t("attach.failed"), { description: String((e as Error)?.message ?? e).slice(0, 300) })
    } finally {
      setBusy(false)
    }
  }

  const localCandidates = useMemo(() => {
    if (!details || !props.target) return []
    const ranked = suggestLocal(props.target, details)
    const rankedSlugs = new Set(ranked.map((r) => r.slug))
    return [...ranked.map((r) => details.find((d) => d.slug === r.slug)!), ...details.filter((d) => !rankedSlugs.has(d.slug))].map((d) => ({ d, suggested: rankedSlugs.has(d.slug) }))
  }, [details, props.target])

  return (
    <Modal onClose={close}>
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="flex-1">
          <div className="text-base font-semibold">{t("attach.title")}</div>
          <p className="text-sm text-muted-foreground">{t("attach.sub")}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label={t("attach.close")} disabled={busy}><X /></Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* What goes where */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("attach.converted")}</div>
            {detail ? (
              <>
                <div className="truncate text-[13px] font-medium">{detail.hymn.title || detail.review.title}</div>
                <div className="truncate text-xs text-muted-foreground">{where(detail.hymn)}</div>
                {slug && props.target && !busy && !done && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSlug(null)}>{t("attach.change")}</Button>}
              </>
            ) : (
              <div className="text-xs text-muted-foreground">{t("attach.pickLocal")}</div>
            )}
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
          <div className="rounded-lg border p-3">
            <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Exalto</div>
            {target ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{target.title}</span>
                  <NotesBadge has={hasNotes(target)} />
                </div>
                <div className="truncate text-xs text-muted-foreground">{where(target)} · {statusLabel(target.status)}</div>
                {props.slug && !busy && !done && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setTargetId(null)}>{t("attach.change")}</Button>}
              </>
            ) : (
              <div className="text-xs text-muted-foreground">{t("attach.pickTarget")}</div>
            )}
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : choosingTarget ? (
          !hymns || !detail ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("attach.loading")}</div>
          ) : detail.review.kind === "lyrics" ? (
            <p className="text-sm text-muted-foreground">{t("attach.lyricsOnly")}</p>
          ) : (
            <TargetPicker want={detail.hymn} hymns={hymns} onPick={(h) => setTargetId(h.id)} />
          )
        ) : choosingLocal ? (
          !details ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("attach.loading")}</div>
          ) : !details.length ? (
            <p className="text-sm text-muted-foreground">{t("attach.noLocal")}</p>
          ) : (
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("attach.pickLocal")}</div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                {localCandidates.map(({ d, suggested }) => (
                  <button key={d.slug} onClick={() => setSlug(d.slug)} className="flex w-full items-center gap-3 border-b border-muted px-3 py-2 text-left last:border-b-0 hover:bg-accent/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{d.hymn.title || d.review.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{where(d.hymn)}</span>
                    </span>
                    {suggested && <span className="text-xs text-sky-700 dark:text-sky-300">{t("attach.suggested")}</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        ) : detail && now ? (
          <>
            {now.hasScore && <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t("attach.alreadyHasNotes")}</p>}
            <BeforeAfter detail={detail} now={now} replaceLyrics={replaceLyrics} />
            <LyricsChoice detail={detail} now={now} replace={replaceLyrics} setReplace={setReplaceLyrics} />
            {steps && <StepList steps={steps} busy={busy} />}
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("attach.loading")}</div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <Button variant="outline" onClick={close} disabled={busy}>{done ? t("attach.close") : t("attach.cancel")}</Button>
        {!done && (
          <Button onClick={run} disabled={busy || !detail || !now || !target || detail.review.kind === "lyrics"}>
            {busy ? <Loader2 className="animate-spin" /> : <CloudUpload />}
            {t("attach.confirm")}
          </Button>
        )}
      </div>
    </Modal>
  )
}
