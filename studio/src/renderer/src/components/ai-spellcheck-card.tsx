import { Check, Loader2, Settings, Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/hooks/use-locale"
import { flattenLines, type ReviewItem } from "@/lib/ai-spellcheck"
import { studio, type LyricSection } from "@/lib/studio"

type Provider = "anthropic" | "gemini"
const PROVIDER_NAME: Record<Provider, string> = { anthropic: "Claude", gemini: "Gemini" }

/**
 * "Check spelling with AI": sends the lyric lines to the saved key's provider (the main process makes
 * the call) and lists the suggested fixes. Each one waits for Accept or Ignore; nothing changes before.
 * `onAccept` applies one fix to the text and returns false if the word isn't there anymore.
 */
export function AiSpellcheckCard({
  sections,
  language,
  resetKey,
  onAccept,
  openSettings,
}: {
  sections: LyricSection[]
  language: "es" | "en"
  /** Changes when the hymn changes or edits are discarded: clears the list. */
  resetKey: string
  onAccept: (items: ReviewItem[]) => ReviewItem[]
  openSettings?: () => void
}) {
  const t = useT()
  const [provider, setProvider] = useState<Provider | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usedProvider, setUsedProvider] = useState<Provider | null>(null)

  useEffect(() => {
    studio.keyStatus().then(
      (s) => setProvider(s.anthropic ? "anthropic" : s.gemini ? "gemini" : null),
      () => setProvider(null),
    )
  }, [])
  useEffect(() => {
    setItems(null)
    setError(null)
  }, [resetKey])

  const { lines } = flattenLines(sections)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await studio.aiSpellcheck(lines, language)
      setUsedProvider(r.provider)
      if (r.ok) setItems(r.suggestions.map((s, id) => ({ ...s, id, lineText: lines[s.line] ?? "" })))
      else {
        setItems(null)
        setError(t(`ai.err.${r.code}`, { provider: r.provider ? PROVIDER_NAME[r.provider] : "" }))
        if (r.code === "noKey") setProvider(null)
      }
    } catch {
      setError(t("ai.err.failed", { provider: "" }))
    } finally {
      setBusy(false)
    }
  }
  const drop = (ids: number[]) => setItems((cur) => cur?.filter((i) => !ids.includes(i.id)) ?? null)
  const accept = (list: ReviewItem[]) => {
    const missed = new Set(onAccept(list).map((i) => i.id))
    // Fixes that applied leave the list; ones whose word is gone stay so the user can ignore them.
    drop(list.filter((i) => !missed.has(i.id)).map((i) => i.id))
  }

  if (provider === undefined) return null
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4" />
        {t("ai.title")}
        {items && <Badge variant="secondary">{items.length}</Badge>}
      </div>
      {provider === null ? (
        <>
          <p className="text-sm text-muted-foreground">{t("ai.needKey")}</p>
          {openSettings && (
            <Button variant="outline" size="sm" className="self-start" onClick={openSettings}><Settings />{t("ai.openSettings")}</Button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("ai.sub", { provider: PROVIDER_NAME[provider] })}</p>
          <Button variant="outline" className="self-start" disabled={busy || !lines.length} onClick={run}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? t("ai.checking") : t("ai.check")}
          </Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {items && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">{t("ai.none", { provider: usedProvider ? PROVIDER_NAME[usedProvider] : "" })}</p>
      )}
      {items && items.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-muted-foreground">{t("ai.reviewHint")}</span>
            <Button size="sm" onClick={() => accept(items)}><Check />{t("ai.acceptAll")}</Button>
          </div>
          <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="rounded-md border p-2.5 text-sm">
                <div>
                  <span className="text-red-700 line-through dark:text-red-400">{i.original}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">{i.suggestion}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground" title={i.lineText}>
                  {t("ai.line", { n: i.line + 1 })} · {i.lineText}
                </div>
                {i.reason && <div className="mt-0.5 text-xs text-muted-foreground">{i.reason}</div>}
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => accept([i])}><Check />{t("ai.accept")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => drop([i.id])}><X />{t("ai.ignore")}</Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
