import { Check, Cpu, FolderOpen, Info, KeyRound, Languages, LogOut, Monitor, Moon, RefreshCw, Sun, Upload, UserRoundCog, X } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useAuth, type Role } from "@/hooks/use-auth"
import { useLocale, useT, type LanguagePreference } from "@/hooks/use-locale"
import { SoundSwitch, useSound } from "@/hooks/use-sound"
import { useTheme, type ThemeMode } from "@/hooks/use-theme"
import { firebaseConfigured, usingEmulators } from "@/lib/firebase"
import { studio } from "@/lib/studio"
import { cn } from "@/lib/utils"

type Env = Awaited<ReturnType<typeof studio.env>>

/** "Owner" / "Propietario"…, or "Studio access" for someone on the access list without a role. */
export function useRoleLabel() {
  const t = useT()
  return (role: Role) => (role ? t(`role.${role}`) : t("role.none"))
}

/** Account, appearance, language, sound and app info. */
export function SettingsPage() {
  const t = useT()
  const [env, setEnv] = useState<Env | null>(null)
  useEffect(() => {
    studio.env().then(setEnv)
  }, [])

  return (
    <>
      <PageHeader title={t("settings.title")} sub={t("settings.sub")} />
      <div className="flex max-w-3xl flex-col gap-5">
        <AccountCard />
        <Card className="gap-0 p-0">
          <Row title={t("settings.appearance")} help={t("settings.appearanceHelp")}>
            <ThemeChoice />
          </Row>
          <Separator />
          <Row title={t("settings.language")} help={t("settings.languageHelp")}>
            <LanguageChoice />
          </Row>
          <Separator />
          <Row title={t("settings.sound")} help={t("settings.soundHelp")}>
            <SoundChoice />
          </Row>
        </Card>
        <ApiKeysCard />
        <AboutCard env={env} />
      </div>
    </>
  )
}

function Row({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {help && <div className="text-xs text-muted-foreground">{help}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Google photo, or initials when there's none (or it fails to load). */
export function Avatar({ photo, name, className = "size-14 text-lg" }: { photo: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  if (photo && !broken)
    return <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn("shrink-0 rounded-full object-cover", className)} />
  return (
    <div aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", className)}>
      {initials}
    </div>
  )
}

function AccountCard() {
  const { user, role, canUpload, signOut, refreshRole } = useAuth()
  const t = useT()
  const roleLabel = useRoleLabel()
  const [busy, setBusy] = useState<"refresh" | "out" | null>(null)
  if (!firebaseConfigured && !usingEmulators)
    return (
      <Card className="p-5 text-sm text-muted-foreground">{t("settings.notConnected")}</Card>
    )
  if (!user) return null
  const name = user.displayName ?? user.email ?? t("nav.signedIn")

  const run = async (kind: "refresh" | "out", fn: () => Promise<void>, done?: string) => {
    setBusy(kind)
    try {
      await fn()
      if (done) toast.success(done)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-4 px-5 py-5">
        <Avatar photo={user.photoURL} name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-semibold">{name}</div>
            <Badge variant={role ? "default" : "secondary"}>{roleLabel(role)}</Badge>
          </div>
          {user.displayName && user.email && <div className="truncate text-sm text-muted-foreground">{user.email}</div>}
          <div className={cn("mt-1 flex items-center gap-1.5 text-xs", canUpload ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
            {canUpload ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            {canUpload ? t("settings.canUpload") : t("settings.cannotUpload")}
          </div>
        </div>
      </div>
      <Separator />
      <div className="flex flex-col gap-2 bg-muted/30 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => run("refresh", refreshRole, t("settings.accessRefreshed"))}>
            <RefreshCw className={cn(busy === "refresh" && "animate-spin")} />
            {t("settings.refreshAccess")}
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={() => run("out", signOut)} title={t("settings.switchAccountHint")}>
            <UserRoundCog />
            {t("settings.switchAccount")}
          </Button>
          <div className="flex-1" />
          <Button variant="destructive" disabled={!!busy} onClick={() => run("out", signOut)}>
            <LogOut />
            {t("settings.signOut")}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">{t("settings.refreshHint")}</div>
      </div>
    </Card>
  )
}

/** Segmented Light / Dark / System control. */
export function ThemeChoice({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const t = useT()
  const opts: [ThemeMode, typeof Sun, string][] = [
    ["light", Sun, t("theme.light")],
    ["dark", Moon, t("theme.dark")],
    ["system", Monitor, t("theme.system")],
  ]
  return (
    <div className={cn("flex rounded-lg p-0.5", compact ? "bg-sidebar-accent" : "bg-muted")} role="radiogroup" aria-label={t("theme.label")}>
      {opts.map(([m, Icon, label]) => (
        <button
          key={m}
          role="radio"
          aria-checked={theme === m}
          aria-label={label}
          title={label}
          onClick={() => setTheme(m)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md text-muted-foreground",
            compact ? "size-7" : "px-3 py-1 text-sm",
            theme === m && "bg-background text-foreground shadow-sm",
            theme === m && !compact && "font-medium",
          )}
        >
          <Icon className="size-3.5" />
          {!compact && label}
        </button>
      ))}
    </div>
  )
}

/** Segmented Español / English / System control. */
function LanguageChoice() {
  const { preference, setPreference, t } = useLocale()
  const opts: [LanguagePreference, string, string | undefined][] = [
    ["es", "Español", "es"],
    ["en", "English", "en"],
    ["system", t("settings.languageSystem"), undefined],
  ]
  return (
    <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={t("settings.language")}>
      {opts.map(([v, label, lang]) => (
        <button
          key={v}
          role="radio"
          lang={lang}
          aria-checked={preference === v}
          onClick={() => setPreference(v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-muted-foreground",
            preference === v && "bg-background font-medium text-foreground shadow-sm",
          )}
        >
          {v === "system" && <Languages className="size-3.5" />}
          {label}
        </button>
      ))}
    </div>
  )
}

function SoundChoice() {
  const [sound, setSound] = useSound()
  // SoundSwitch carries its own "Sound" caption; the row title already says it.
  return (
    <div className="[&>div>span:first-child]:hidden">
      <SoundSwitch sound={sound} onChange={setSound} />
    </div>
  )
}

type KeyStatus = Awaited<ReturnType<typeof studio.keyStatus>>
type Provider = "anthropic" | "gemini"

/** Claude and Gemini API keys for the vision readers on Import, kept encrypted on this computer. */
function ApiKeysCard() {
  const t = useT()
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const refresh = () => studio.keyStatus().then(setStatus)
  useEffect(() => void refresh(), [])
  return (
    <Card className="gap-0 p-0">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-foreground" />
          {t("keys.title")}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{t("keys.help")}</div>
      </div>
      {status && !status.secure && <div className="px-5 pb-3 text-xs text-destructive">{t("keys.insecure")}</div>}
      <KeyRow provider="anthropic" title={t("keys.anthropic")} placeholder="sk-ant-…" status={status} onChange={refresh} />
      <Separator />
      <KeyRow provider="gemini" title={t("keys.gemini")} placeholder="AIza…" status={status} onChange={refresh} />
    </Card>
  )
}

function KeyRow({ provider, title, placeholder, status, onChange }: { provider: Provider; title: string; placeholder: string; status: KeyStatus | null; onChange: () => void }) {
  const t = useT()
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const saved = status?.[provider]
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await fn()
      setValue("")
      toast.success(done)
      onChange()
    } catch (e) {
      toast.error(t("keys.failed", { error: String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "") }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Row
      title={title}
      help={saved ? t("keys.saved", { last4: saved.last4 }) : t("keys.notSet")}
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) run(() => studio.setKey(provider, value), t("keys.savedToast", { name: title }))
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="w-56 font-mono"
          placeholder={saved ? t("keys.replace") : placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy || status?.secure === false}
          aria-label={title}
        />
        <Button type="submit" variant="outline" disabled={busy || !value.trim()}>{t("keys.save")}</Button>
        {saved && (
          <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={t("keys.remove", { name: title })} title={t("keys.remove", { name: title })}
            onClick={() => run(() => studio.clearKey(provider), t("keys.removedToast", { name: title }))}>
            <X />
          </Button>
        )}
      </form>
    </Row>
  )
}

function AboutCard({ env }: { env: Env | null }) {
  const t = useT()
  const reveal = async () => {
    const err = await studio.revealFolder()
    if (err) toast.error(err)
  }
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-sm font-semibold">
        <Info className="size-4 text-muted-foreground" />
        {t("settings.about")}
      </div>
      <Row title={t("settings.version")}>
        <span className="font-mono text-sm text-muted-foreground">{env ? `Exalto Hymn Studio ${env.version}` : "…"}</span>
      </Row>
      <Separator />
      <Row
        title={t("settings.converted")}
        help={<span className="block truncate font-mono" title={env?.outDir}>{env?.outDir ?? "…"}</span>}
      >
        <Button variant="outline" disabled={!env} onClick={reveal}>
          <FolderOpen />
          {t("settings.showInFinder")}
        </Button>
      </Row>
      <Separator />
      <Row title={t("settings.engine")} help={t("settings.engineHelp")}>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Cpu className="size-4" />
          {t("settings.engineValue")}
        </span>
        {env && !env.pythonReady && <Badge variant="destructive">{t("settings.notInstalled")}</Badge>}
      </Row>
      <Separator />
      <Row title={t("settings.server")} help={t("settings.serverHelp")}>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Upload className="size-4" />
          {usingEmulators ? t("settings.serverEmulator") : firebaseConfigured ? t("settings.serverProduction") : t("settings.serverNone")}
        </span>
        {usingEmulators && <Badge variant="secondary">{t("settings.dev")}</Badge>}
      </Row>
    </Card>
  )
}
