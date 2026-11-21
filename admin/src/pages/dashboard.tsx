import { AlertCircle, BookOpen, FilePen, Layers } from "lucide-react"
import { Link } from "react-router"

import { Page } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuditLog, useHymns } from "@/lib/hymns"
import { formatWhen } from "@/lib/format"

function Stat({ label, value, hint, icon: Icon, loading }: { label: string; value: number; hint: string; icon: typeof BookOpen; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="font-medium">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold tracking-tight">{value}</div>}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const hymns = useHymns()
  const audit = useAuditLog(8)
  const list = hymns.data
  const official = list.filter((h) => h.hymnalId === "idc-himnario").length
  const published = list.filter((h) => h.status === "published").length
  const drafts = list.filter((h) => h.status === "draft").length
  const review = list.filter((h) => h.status === "review")

  return (
    <Page crumbs={[{ label: "Overview" }, { label: "Dashboard" }]} title="Dashboard" description="What's happening in Exalto.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total hymns" value={list.length} hint={`${official} official · ${list.length - official} community`} icon={Layers} loading={hymns.loading} />
        <Stat label="Published" value={published} hint="Visible in the app" icon={BookOpen} loading={hymns.loading} />
        <Stat label="Drafts" value={drafts} hint="Not visible yet" icon={FilePen} loading={hymns.loading} />
        <Stat label="Needs review" value={review.length} hint="Community uploads waiting" icon={AlertCircle} loading={hymns.loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for review</CardTitle>
            <CardDescription>Community hymns that aren't live yet</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {review.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting. New uploads show up here.</p>}
            {review.slice(0, 6).map((h) => (
              <div key={h.id} className="flex items-center gap-3">
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{h.title}</span>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/hymns/${h.id}`}>Review</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent admin activity</CardTitle>
            <CardDescription>From the audit log</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {audit.loading && <Skeleton className="h-16" />}
            {!audit.loading && audit.data.length === 0 && <p className="text-sm text-muted-foreground">No changes yet.</p>}
            {audit.data.map((e) => (
              <div key={e.id} className="flex items-baseline gap-3 text-sm">
                <span className="font-medium">{e.actorName}</span>
                <span className="flex-1 truncate text-muted-foreground">
                  {e.action} {e.target}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(e.at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}
