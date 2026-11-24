import { Loader2, LogIn, LogOut, RefreshCw, ShieldX, WifiOff } from "lucide-react"
import { useState, type ReactNode } from "react"
import exaltoMark from "@/assets/exalto-mark.svg"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useLocale, type Language } from "@/hooks/use-locale"
import { cn } from "@/lib/utils"

/** Nothing in Studio is usable until the person signs in and is allowed (owner/editor or on the admin's access list). */
export function AccessGate({ children }: { children: ReactNode }) {
  const { access, user, signIn, signOut, refreshRole } = useAuth()
  const { t, rich } = useLocale()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local development without Firebase settings: let the developer in, but never in a packaged build.
  if (access === "allowed" || (access === "unconfigured" && import.meta.env.DEV)) return <>{children}</>

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  let body: ReactNode
  if (access === "loading" || access === "checking") {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {access === "loading" ? t("gate.opening") : t("gate.checking")}
      </div>
    )
  } else if (access === "signed-out") {
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t("gate.signInPrompt")}</p>
        <Button size="lg" onClick={() => run(signIn)} disabled={busy} className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <LogIn />} {busy ? t("gate.finishInBrowser") : t("gate.signInGoogle")}
        </Button>
      </>
    )
  } else if (access === "denied") {
    body = (
      <>
        <div className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <ShieldX className="mt-0.5 size-4 shrink-0" />
          <span>{rich("gate.denied", { email: <b>{user?.email}</b>, studioAccess: <b>{t("gate.studioAccess")}</b> })}</span>
        </div>
        <div className="flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={() => run(refreshRole)} disabled={busy}><RefreshCw /> {t("gate.checkAgain")}</Button>
          <Button variant="ghost" className="flex-1" onClick={() => run(signOut)} disabled={busy}><LogOut /> {t("gate.otherAccount")}</Button>
        </div>
      </>
    )
  } else if (access === "offline") {
    body = (
      <>
        <div className="flex items-start gap-3 rounded-lg border p-3 text-sm text-muted-foreground">
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          <span>{t("gate.offline")}</span>
        </div>
        <Button variant="ghost" onClick={() => run(signOut)} disabled={busy}><LogOut /> {t("gate.signOut")}</Button>
      </>
    )
  } else {
    body = <p className="text-sm text-muted-foreground">{t("gate.unconfigured")}</p>
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="h-10 shrink-0 border-b bg-sidebar [-webkit-app-region:drag]" />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
          <img src={exaltoMark} alt="" className="size-14 object-contain" />
          <div>
            <h1 className="text-xl font-semibold">{t("app.name")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
          {body}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
      <GateLanguage />
    </div>
  )
}

/** Settings isn't reachable before sign-in, so the gate has its own Español / English switch. */
function GateLanguage() {
  const { language, setPreference, t } = useLocale()
  const opts: [Language, string][] = [["es", "Español"], ["en", "English"]]
  return (
    <div className="flex justify-center pb-5">
      <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label={t("settings.language")}>
        {opts.map(([v, label]) => (
          <button
            key={v}
            role="radio"
            lang={v}
            aria-checked={language === v}
            onClick={() => setPreference(v)}
            className={cn("rounded-md px-2.5 py-1 text-muted-foreground", language === v && "bg-background font-medium text-foreground shadow-sm")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
