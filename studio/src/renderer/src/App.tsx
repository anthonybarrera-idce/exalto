import { Download, Headphones, Music, Settings, Share, Type, BookOpen, ChevronRight } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import exaltoMark from "@/assets/exalto-mark.svg"
import { StudioProvider, useStudio } from "@/hooks/use-studio"
import { AuthProvider, useAuth } from "@/hooks/use-auth"
import { AccessGate } from "@/components/access-gate"
import { usingEmulators } from "@/lib/firebase"
import { ImportPage } from "@/pages/import"
import { ReviewPage } from "@/pages/review"
import { LyricsPage } from "@/pages/lyrics"
import { PracticePage } from "@/pages/practice"
import { ExportPage } from "@/pages/export"
import { DetailsPage } from "@/pages/details"
import { Avatar, SettingsPage, ThemeChoice, useRoleLabel } from "@/pages/settings"
import { useT } from "@/hooks/use-locale"

const PAGES = [
  { id: "import", label: "nav.import", icon: Download, el: ImportPage },
  { id: "review", label: "nav.review", icon: Music, el: ReviewPage },
  { id: "lyrics", label: "nav.lyrics", icon: Type, el: LyricsPage },
  { id: "details", label: "nav.details", icon: BookOpen, el: DetailsPage },
  { id: "practice", label: "nav.practice", icon: Headphones, el: PracticePage },
  { id: "export", label: "nav.export", icon: Share, el: ExportPage },
] as const
export type PageId = (typeof PAGES)[number]["id"] | "settings"

export function App() {
  return (
    <AuthProvider>
      <AccessGate>
        <StudioProvider>
          <Shell />
        </StudioProvider>
      </AccessGate>
    </AuthProvider>
  )
}

function Shell() {
  const t = useT()
  const [page, setPage] = useState<PageId>("import")
  const Page = page === "settings" ? SettingsPage : PAGES.find((p) => p.id === page)!.el
  const navClass = (active: boolean) =>
    cn(
      "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent",
      active && "bg-sidebar-accent font-medium text-sidebar-foreground",
    )
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* macOS draws the traffic lights over this bar (titleBarStyle: hiddenInset) */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar pl-20 [-webkit-app-region:drag]">
        <img src={exaltoMark} alt="" className="size-4 object-contain" />
        <span className="text-[13px] font-medium text-muted-foreground">{t("app.name")}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-58 shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground">
          <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
            <img src={exaltoMark} alt="Exalto" className="size-8 shrink-0 object-contain" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold">Hymn Studio</div>
              <div className="text-xs text-muted-foreground">{t("nav.subtitle")}</div>
            </div>
          </div>
          <div className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">{t("nav.workflow")}</div>
          {PAGES.map((p) => (
            <button key={p.id} onClick={() => setPage(p.id)} className={navClass(page === p.id)}>
              <p.icon className="size-4" />
              {t(p.label)}
            </button>
          ))}
          <div className="flex-1" />
          <HymnPicker />
          <EngineCard />
          <div className="mb-1 flex items-center gap-1">
            <button onClick={() => setPage("settings")} className={cn(navClass(page === "settings"), "flex-1")}>
              <Settings className="size-4" />
              {t("nav.settings")}
            </button>
            <ThemeChoice compact />
          </div>
          <AccountRow open={() => setPage("settings")} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <Page go={setPage} />
        </main>
      </div>
    </div>
  )
}

function HymnPicker() {
  const { hymns, slug, select } = useStudio()
  const t = useT()
  if (!hymns.length) return null
  return (
    <label className="mb-2 flex flex-col gap-1 px-1 text-xs text-muted-foreground">
      {t("nav.hymn")}
      <select
        value={slug ?? ""}
        onChange={(e) => select(e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
      >
        {hymns.map((h) => (
          <option key={h.slug} value={h.slug}>
            {h.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function EngineCard() {
  const t = useT()
  return (
    <div className="mb-2 rounded-lg border bg-background px-3 py-2.5">
      <div className="text-[13px] font-medium">{t("nav.engine")}</div>
      <div className="text-xs text-muted-foreground">{t("nav.engineSub")}</div>
    </div>
  )
}

function AccountRow({ open }: { open: () => void }) {
  const { user, role } = useAuth()
  const t = useT()
  const roleLabel = useRoleLabel()
  if (!user) return null
  const name = user.displayName ?? user.email ?? t("nav.signedIn")
  return (
    <button
      onClick={open}
      title={t("nav.accountSettings")}
      className="flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-left hover:bg-accent"
    >
      <Avatar photo={user.photoURL} name={name} className="size-7 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {roleLabel(role)}
          {usingEmulators ? t("nav.emulator") : ""}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  )
}
