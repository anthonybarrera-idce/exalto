import { BookOpen, ChevronRight, WifiOff } from "lucide-react"
import { Link } from "react-router"

import { Page } from "@/components/admin-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { HYMNALS } from "@/lib/hymnals"
import { useHymns } from "@/lib/hymns"
import type { HymnStatus } from "@/lib/types"

const STATUS_ORDER: { status: HymnStatus; label: string; className: string }[] = [
  { status: "published", label: "Published", className: "bg-green-500" },
  { status: "draft", label: "Draft", className: "bg-zinc-300 dark:bg-zinc-600" },
  { status: "review", label: "In review", className: "bg-yellow-400" },
  { status: "hidden", label: "Hidden", className: "bg-red-400" },
]

export function HymnalsPage() {
  const { data, loading } = useHymns()

  return (
    <Page
      crumbs={[{ label: "Content" }, { label: "Hymnals" }]}
      title="Hymnals"
      description="Collections shown in the Himnario picker. Official hymnals are cached on the phone for offline use."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {HYMNALS.map((hymnal) => {
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
                    <Badge variant={hymnal.visible ? "secondary" : "destructive"}>{hymnal.visible ? "Visible in app" : "Hidden"}</Badge>
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
        Adding or renaming hymnals comes later. For now they're defined in <code className="rounded bg-muted px-1">src/lib/hymnals.ts</code>.
      </p>
    </Page>
  )
}
