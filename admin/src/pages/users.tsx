import { AlertTriangle, Ban, ChevronLeft, ChevronRight, Crown, Mic, MoreHorizontal, PenLine, RotateCcw, Search, Shield, Trash2, User as UserIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { canManageTeam, useAuth } from "@/lib/auth"
import { formatWhen } from "@/lib/format"
import type { AppUser, UserRole, UserStatus } from "@/lib/types"
import { deleteUserAccount, setUserRole, setUserStatus, useUsers } from "@/lib/users"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20

const ROLE_LABEL: Record<UserRole, string> = { listener: "Listener", composer: "Composer", moderator: "Moderator", editor: "Editor", admin: "Admin", owner: "Owner" }
const ROLE_STYLE: Record<UserRole, string> = {
  listener: "bg-secondary text-secondary-foreground",
  composer: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  moderator: "border-border bg-transparent text-foreground",
  editor: "border-border bg-transparent text-foreground",
  admin: "bg-foreground/85 text-background",
  owner: "bg-primary text-primary-foreground",
}
const STATUS_LABEL: Record<UserStatus, string> = { active: "Active", warned: "Warned", suspended: "Suspended" }
const STATUS_STYLE: Record<UserStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  warned: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  suspended: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
}

function joined(u: AppUser) {
  return u.createdAt ? u.createdAt.toDate().toLocaleDateString("en", { month: "short", year: "numeric" }) : "—"
}

export function UsersPage() {
  const { data, loading, error } = useUsers()
  const { role: myRole, user: me } = useAuth()
  // Owners and admins manage roles; only an owner can touch another owner (the Cloud Functions enforce this too).
  const canManage = canManageTeam(myRole)
  const canManageUser = (u: AppUser) => canManage && (u.role !== "owner" || myRole === "owner")
  const [q, setQ] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all")
  const [page, setPage] = useState(0)
  const [toDelete, setToDelete] = useState<AppUser | null>(null)
  const [confirmText, setConfirmText] = useState("")

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "")
    return data.filter(
      (u) =>
        (roleFilter === "all" || u.role === roleFilter) &&
        (statusFilter === "all" || u.status === statusFilter) &&
        (!needle || u.displayName.toLowerCase().includes(needle) || u.handle.toLowerCase().includes(needle)),
    )
  }, [data, q, roleFilter, statusFilter])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  async function run(label: string, fn: () => Promise<void>) {
    try {
      await fn()
      toast.success(label)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong."
      toast.error(/not-found|internal/i.test(msg) ? "That action needs the admin Cloud Functions, which aren't deployed yet." : msg)
    }
  }

  return (
    <Page crumbs={[{ label: "Community" }, { label: "Users" }]} title="Users" description="Everyone with an Exalto account. Guests aren't listed.">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search by name or username…" className="pl-8" />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v as typeof roleFilter); setPage(0) }}>
          <SelectTrigger className="w-40" aria-label="Filter by role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(0) }}>
          <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as UserStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{data.length} user{data.length === 1 ? "" : "s"}</span>
      </div>

      {error && <p className="text-sm text-destructive">Couldn't load users: {error.message}</p>}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Church</TableHead>
              <TableHead>Uploads</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8" /></TableCell></TableRow>
              ))}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                  {data.length === 0 ? "No accounts yet. People appear here after they sign up in the app." : "No users match these filters."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((u) => {
              const isMe = u.id === me?.uid
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {u.photoURL && <AvatarImage src={u.photoURL} alt="" />}
                        <AvatarFallback className={cn((u.role === "composer" || u.role === "owner") && "bg-gradient-to-br from-[#04C1FF] to-[#EEA246] text-white")}>
                          {initials(u.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.displayName}{isMe && <span className="text-muted-foreground"> (you)</span>}</div>
                        {u.handle && <div className="truncate text-xs text-muted-foreground">@{u.handle}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className={ROLE_STYLE[u.role]}>{ROLE_LABEL[u.role]}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn("gap-1.5", STATUS_STYLE[u.status])}>
                      <span className="size-1.5 rounded-full bg-current" />{STATUS_LABEL[u.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.church || "—"}</TableCell>
                  <TableCell>{u.uploadCount}</TableCell>
                  <TableCell className="text-muted-foreground">{joined(u)}</TableCell>
                  <TableCell className="text-muted-foreground">{u.lastActiveAt ? formatWhen(u.lastActiveAt) : "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${u.displayName}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="truncate">{u.displayName}</DropdownMenuLabel>
                        {canManageUser(u) && !isMe && (
                          <>
                            {u.role !== "admin" && (
                              <DropdownMenuItem onSelect={() => run(`${u.displayName} is now an admin`, () => setUserRole(u, "admin"))}><Crown /> Make admin</DropdownMenuItem>
                            )}
                            {u.role !== "composer" && (
                              <DropdownMenuItem onSelect={() => run(`${u.displayName} is now a composer`, () => setUserRole(u, "composer"))}><Mic /> Make composer</DropdownMenuItem>
                            )}
                            {u.role !== "moderator" && (
                              <DropdownMenuItem onSelect={() => run(`${u.displayName} is now a moderator`, () => setUserRole(u, "moderator"))}><Shield /> Make moderator</DropdownMenuItem>
                            )}
                            {u.role !== "editor" && (
                              <DropdownMenuItem onSelect={() => run(`${u.displayName} is now an editor`, () => setUserRole(u, "editor"))}><PenLine /> Make editor</DropdownMenuItem>
                            )}
                            {u.role !== "listener" && (
                              <DropdownMenuItem onSelect={() => run(`${u.displayName} is now a listener`, () => setUserRole(u, "listener"))}><UserIcon /> Make listener</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {!isMe && u.status !== "active" && (
                          <DropdownMenuItem onSelect={() => run(`${u.displayName} reactivated`, () => setUserStatus(u, "active"))}><RotateCcw /> Reactivate</DropdownMenuItem>
                        )}
                        {!isMe && u.status === "active" && (
                          <DropdownMenuItem onSelect={() => run(`${u.displayName} warned`, () => setUserStatus(u, "warned"))}><AlertTriangle /> Warn</DropdownMenuItem>
                        )}
                        {!isMe && u.status !== "suspended" && (
                          <DropdownMenuItem onSelect={() => run(`${u.displayName} suspended`, () => setUserStatus(u, "suspended"))}><Ban /> Suspend</DropdownMenuItem>
                        )}
                        {canManageUser(u) && !isMe && (
                          <DropdownMenuItem variant="destructive" onSelect={() => { setConfirmText(""); setToDelete(u) }}><Trash2 /> Delete account</DropdownMenuItem>
                        )}
                        {isMe && <DropdownMenuItem disabled>No actions on your own account</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{rows.length} shown</span>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Page {current + 1} of {pageCount}</span>
          <Button variant="outline" size="icon" className="size-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft /></Button>
          <Button variant="outline" size="icon" className="size-8" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight /></Button>
        </div>
      </div>

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.displayName}'s account?</DialogTitle>
            <DialogDescription>
              This permanently removes their sign-in and profile. Their uploads stay until you remove them separately. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="confirm-delete" className="text-sm font-medium">Type DELETE to confirm</label>
            <Input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE"}
              onClick={() => {
                const u = toDelete
                setToDelete(null)
                if (u) void run("Account deleted", () => deleteUserAccount(u))
              }}
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
