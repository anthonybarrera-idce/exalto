import { ChevronLeft, ChevronRight, EyeOff, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { HymnStatusBadge } from "@/components/hymn-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { canEditContent, useAuth } from "@/lib/auth"
import { formatWhen } from "@/lib/format"
import { hymnalName } from "@/lib/hymnals"
import { deleteHymn, setHymnStatus, useHymns } from "@/lib/hymns"
import type { Hymn } from "@/lib/types"

type Filter = "all" | "idc-himnario" | "community" | "draft"
const PAGE_SIZE = 20

function matches(h: Hymn, q: string) {
  if (!q) return true
  const needle = q.toLowerCase()
  if (String(h.number ?? "") === needle || h.label?.toLowerCase() === needle) return true
  if (h.title.toLowerCase().includes(needle)) return true
  return h.lyrics.some((s) => s.lines.some((l) => l.toLowerCase().includes(needle)))
}

export function HymnsPage() {
  const { data, loading, error } = useHymns()
  const { role } = useAuth()
  const canEdit = canEditContent(role)
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const [toDelete, setToDelete] = useState<Hymn | null>(null)

  const counts = useMemo(
    () => ({
      all: data.length,
      "idc-himnario": data.filter((h) => h.hymnalId === "idc-himnario").length,
      community: data.filter((h) => h.hymnalId === "community").length,
      draft: data.filter((h) => h.status === "draft").length,
    }),
    [data],
  )

  const rows = useMemo(() => {
    const list = data.filter((h) => {
      if (filter === "draft") return h.status === "draft"
      if (filter !== "all") return h.hymnalId === filter
      return true
    })
    return list
      .filter((h) => matches(h, q.trim()))
      .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || (a.label ?? "").localeCompare(b.label ?? "") || a.title.localeCompare(b.title))
  }, [data, filter, q])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  async function run(label: string, fn: () => Promise<void>) {
    try {
      await fn()
      toast.success(label)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.")
    }
  }

  return (
    <Page
      crumbs={[{ label: "Content" }, { label: "Hymns" }]}
      title="Hymns"
      description="Every hymn in the app: the official IDC Himnario and community uploads."
      actions={
        canEdit && (
          <>
            <Button variant="outline" disabled title="Coming next">
              <Upload /> Import
            </Button>
            <Button asChild>
              <Link to="/hymns/new">
                <Plus /> New hymn
              </Link>
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => { setFilter(v as Filter); setPage(0) }}>
          <TabsList>
            {(
              [
                ["all", "All"],
                ["idc-himnario", "IDC Himnario"],
                ["community", "Community"],
                ["draft", "Drafts"],
              ] as const
            ).map(([v, label]) => (
              <TabsTrigger key={v} value={v}>
                {label} <span className="text-muted-foreground">{counts[v]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0) }}
            placeholder="Filter by number, title or lyrics…"
            className="pl-8"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">Couldn't load hymns: {error.message}</p>}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">No.</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Hymnal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recordings</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {data.length === 0 ? "No hymns yet. Create one or import the IDC Himnario." : "No hymns match this filter."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((h) => (
              <TableRow key={h.id} className="cursor-pointer" onClick={() => navigate(`/hymns/${h.id}`)}>
                <TableCell className="font-mono text-sm">{h.label ?? h.number ?? "—"}</TableCell>
                <TableCell className="font-medium">{h.title}</TableCell>
                <TableCell>
                  <Badge variant={h.hymnalId === "community" ? "secondary" : "outline"}>{hymnalName(h.hymnalId)}</Badge>
                </TableCell>
                <TableCell>
                  <HymnStatusBadge status={h.status} />
                </TableCell>
                <TableCell>{h.recordingCount}</TableCell>
                <TableCell className="text-muted-foreground">{formatWhen(h.updatedAt)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${h.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="truncate">{h.title}</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => navigate(`/hymns/${h.id}`)}>
                        <Pencil /> {canEdit ? "Edit" : "View"}
                      </DropdownMenuItem>
                      {canEdit && (
                        <>
                          <DropdownMenuSeparator />
                          {h.status === "hidden" ? (
                            <DropdownMenuItem onSelect={() => run("Hymn published", () => setHymnStatus(h, "published"))}>
                              <EyeOff /> Show in app
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => run("Hymn hidden", () => setHymnStatus(h, "hidden"))}>
                              <EyeOff /> Hide from app
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(h)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {rows.length} hymn{rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            Page {current + 1} of {pageCount}
          </span>
          <Button variant="outline" size="icon" className="size-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-8" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{toDelete?.title}"?</DialogTitle>
            <DialogDescription>
              This removes the hymn from the app for everyone and can't be undone. To take it down temporarily, hide it instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                const h = toDelete
                setToDelete(null)
                if (h) void run("Hymn deleted", () => deleteHymn(h))
              }}
            >
              Delete hymn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
