import { ArrowRight, Check, Eye, Loader2, RotateCcw, Send, Settings, Sparkles, TriangleAlert, Undo2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/hooks/use-locale"
import { describeHymn, planEdit, type ChatEdit, type ChatErrorCode, type HymnState, type Plan } from "@/lib/ai-chat"
import type { StringKey } from "@/lib/i18n"
import { studio, type LyricSection } from "@/lib/studio"
import { cn } from "@/lib/utils"

type Status = "pending" | "accepted" | "rejected" | "invalid"
type Proposal = { edit: ChatEdit; status: Status; error?: string; undo?: LyricSection[] }
type Msg = { role: "user" | "assistant"; text: string; model?: string; proposals?: Proposal[] }
type Failure = { code: ChatErrorCode; detail?: string }

// The conversation survives moving to another screen and back, per hymn, until the app closes.
const threads = new Map<string, Msg[]>()

type Props = {
  slug: string
  state: HymnState
  /** Put an accepted score edit into the Review draft (undoable there). */
  applyScore: (plan: Extract<Plan, { kind: "score" }>) => void
  /** Save accepted lyric lines (or restore earlier ones on undo). */
  saveLyrics: (sections: LyricSection[]) => Promise<void>
  /** Jump the editor to a 0-based measure. */
  showBar: (bar: number) => void
  openSettings: () => void
}

export function AiChatPanel({ slug, state, applyScore, saveLyrics, showBar, openSettings }: Props) {
  const t = useT()
  const [msgs, setMsgsState] = useState<Msg[]>(() => threads.get(slug) ?? [])
  const setMsgs = (fn: (m: Msg[]) => Msg[]) =>
    setMsgsState((m) => {
      const next = fn(m)
      threads.set(slug, next)
      return next
    })
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Braces matter: scrollIntoView returns a Promise in current Chromium, and an effect may only return a cleanup.
    void end.current?.scrollIntoView({ block: "nearest" })
  }, [msgs.length, busy, failure])

  const ask = async (history: Msg[]) => {
    setBusy(true)
    setFailure(null)
    try {
      const r = await studio.aiChat(history.map((m) => ({ role: m.role, text: m.text })), describeHymn(state))
      if (!r.ok) return setFailure({ code: r.code, detail: r.detail })
      const proposals: Proposal[] = r.edits.map((edit) => {
        const plan = planEdit(edit, state)
        return plan.ok ? { edit, status: "pending" } : { edit, status: "invalid", error: plan.error }
      })
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, model: r.model, proposals }])
    } catch (e) {
      setFailure({ code: "failed", detail: String(e).slice(0, 200) })
    } finally {
      setBusy(false)
    }
  }
  const send = (text = input) => {
    const q = text.trim()
    if (!q || busy) return
    const next = [...msgs, { role: "user" as const, text: q }]
    setMsgs(() => next)
    setInput("")
    void ask(next)
  }
  const retry = () => msgs.length && msgs[msgs.length - 1].role === "user" && void ask(msgs)

  const setStatus = (mi: number, pi: number, patch: Partial<Proposal>) =>
    setMsgs((m) => m.map((msg, i) => (i !== mi ? msg : { ...msg, proposals: msg.proposals!.map((p, j) => (j === pi ? { ...p, ...patch } : p)) })))

  // Re-check against the hymn as it is now (earlier accepts or manual edits may have moved things).
  const accept = async (mi: number, pi: number) => {
    const p = msgs[mi].proposals![pi]
    const plan = planEdit(p.edit, state)
    if (!plan.ok) return setStatus(mi, pi, { status: "invalid", error: plan.error })
    if (plan.kind === "score") {
      applyScore(plan)
      if (plan.bar != null) showBar(plan.bar)
      return setStatus(mi, pi, { status: "accepted" })
    }
    try {
      const before = structuredClone(state.sections)
      await saveLyrics(plan.sections)
      setStatus(mi, pi, { status: "accepted", undo: before })
      toast.success(t("chat.lyricsSaved"))
    } catch (e) {
      toast.error(t("common.couldNotSave") + `: ${String(e).slice(0, 200)}`)
    }
  }
  const undoLyrics = async (mi: number, pi: number) => {
    const p = msgs[mi].proposals![pi]
    if (!p.undo) return
    await saveLyrics(p.undo)
    setStatus(mi, pi, { status: "rejected", undo: undefined })
    toast.success(t("chat.lyricsUndone"))
  }
  // Score edits only: they apply in order to the draft. Lyric lines are saved one at a time.
  const acceptAll = async (mi: number) => {
    for (const [pi, p] of msgs[mi].proposals!.entries()) if (p.status === "pending" && p.edit.type !== "lyricLine") await accept(mi, pi)
  }

  const errText = (f: Failure) => t(`chat.err.${f.code}` as StringKey, { detail: f.detail ? ` (${f.detail})` : "" })
  const examples: StringKey[] = ["chat.example1", "chat.example2", "chat.example3", "chat.example4"]

  return (
    <Card className="flex h-[calc(100vh-12rem)] min-h-[440px] flex-col gap-0 p-0">
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <Sparkles className="mt-0.5 size-4 text-sky-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold">{t("chat.title")}</div>
          <div className="text-xs text-muted-foreground">{t("chat.sub")}</div>
        </div>
        {msgs.length > 0 && (
          <Button size="icon-sm" variant="ghost" title={t("chat.clear")} onClick={() => (setMsgs(() => []), setFailure(null))} disabled={busy}>
            <RotateCcw />
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-sm">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-1.5">
            {examples.map((k) => (
              <button key={k} onClick={() => send(t(k))} disabled={busy} className="rounded-md border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent">
                {t(k)}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, mi) =>
          m.role === "user" ? (
            <div key={mi} className="ml-8 self-end whitespace-pre-wrap rounded-lg bg-sky-100 px-3 py-2 text-sky-950 dark:bg-sky-950 dark:text-sky-100">{m.text}</div>
          ) : (
            <div key={mi} className="flex flex-col gap-2">
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.proposals?.map((p, pi) => (
                <ProposalCard
                  key={pi}
                  p={p}
                  plan={p.status === "pending" ? planEdit(p.edit, state) : null}
                  onAccept={() => void accept(mi, pi)}
                  onReject={() => setStatus(mi, pi, { status: "rejected" })}
                  onShow={(bar) => showBar(bar)}
                  onUndo={() => void undoLyrics(mi, pi)}
                />
              ))}
              {(m.proposals?.filter((p) => p.status === "pending" && p.edit.type !== "lyricLine").length ?? 0) > 1 && (
                <Button size="sm" variant="outline" className="self-start" onClick={() => void acceptAll(mi)}>
                  <Check /> {t("chat.acceptAll", { count: m.proposals!.filter((p) => p.status === "pending" && p.edit.type !== "lyricLine").length })}
                </Button>
              )}
              {m.proposals?.some((p) => p.status === "accepted" && p.edit.type !== "lyricLine") && (
                <div className="text-xs text-muted-foreground">{t("chat.scoreHint")}</div>
              )}
              {m.model && <div className="text-[11px] text-muted-foreground">{t("chat.model", { model: m.model })}</div>}
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("chat.thinking")}</div>
        )}
        {failure && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <div className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {errText(failure)}</div>
            <div className="flex gap-2">
              {(failure.code === "noKey" || failure.code === "badKey") && (
                <Button size="sm" variant="outline" onClick={openSettings}><Settings /> {t("chat.openSettings")}</Button>
              )}
              {failure.code !== "noKey" && failure.code !== "tooLong" && (
                <Button size="sm" variant="outline" onClick={retry}><RotateCcw /> {t("chat.retry")}</Button>
              )}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={t("chat.placeholder")}
          className="max-h-40 min-h-10 resize-none"
          rows={1}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} title={t("chat.send")}><Send /></Button>
      </form>
    </Card>
  )
}

function ProposalCard({ p, plan, onAccept, onReject, onShow, onUndo }: {
  p: Proposal
  plan: Plan | null
  onAccept: () => void
  onReject: () => void
  onShow: (bar: number) => void
  onUndo: () => void
}) {
  const t = useT()
  // A pending edit that no longer fits the hymn (it changed since) shows why instead of Accept.
  const error = p.error ?? (plan && !plan.ok ? plan.error : undefined)
  const changes = plan?.ok ? plan.changes : []
  const bar = plan?.ok && plan.kind === "score" ? plan.bar : p.edit.measure ? p.edit.measure - 1 : undefined
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border px-3 py-2", p.status === "pending" && !error ? "border-sky-300 dark:border-sky-800" : "opacity-80")}>
      <div className="flex items-start gap-2">
        <div className="flex-1 font-medium">{p.edit.summary}</div>
        {p.status === "accepted" && <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{t("chat.accepted")}</Badge>}
        {p.status === "rejected" && <Badge variant="secondary">{t("chat.rejected")}</Badge>}
        {(p.status === "invalid" || (p.status === "pending" && error)) && (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("chat.invalid")}</Badge>
        )}
      </div>
      {changes.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{c.label}:</span>
          {c.before != null && <span className="rounded bg-red-50 px-1 text-red-800 line-through dark:bg-red-950 dark:text-red-300">{c.before}</span>}
          <ArrowRight className="size-3 text-muted-foreground" />
          {c.after != null && <span className="rounded bg-green-50 px-1 text-green-800 dark:bg-green-950 dark:text-green-300">{c.after}</span>}
        </div>
      ))}
      {error && <div className="text-xs text-amber-800 dark:text-amber-300">{error}</div>}
      <div className="flex gap-1.5">
        {bar != null && bar >= 0 && (
          <Button size="xs" variant="ghost" onClick={() => onShow(bar)}><Eye /> {t("chat.show")}</Button>
        )}
        {p.status === "pending" && !error && (
          <>
            <Button size="xs" onClick={onAccept}><Check /> {t("chat.accept")}</Button>
            <Button size="xs" variant="outline" onClick={onReject}><X /> {t("chat.reject")}</Button>
          </>
        )}
        {p.status === "accepted" && p.undo && (
          <Button size="xs" variant="outline" onClick={onUndo}><Undo2 /> {t("chat.undoLyrics")}</Button>
        )}
      </div>
    </div>
  )
}
