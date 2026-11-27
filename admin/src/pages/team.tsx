import { Loader2, Plus, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { canManageTeam, useAuth } from "@/lib/auth"
import { formatWhen } from "@/lib/format"
import { isEmail, normalizeEmail } from "@/lib/studio-access"
import { ADMIN_ROLES, type AdminRole, type AppUser } from "@/lib/types"
import { TEAM_INVITE_ROLES, inviteMember, revokeInvite, setUserRole, useMembers, useUsers, type TeamInviteRole } from "@/lib/users"

const ROLE_INFO: Record<AdminRole, { label: string; desc: string }> = {
  owner: { label: "Owner", desc: "The church account. Always owner; only this account can be." },
  admin: { label: "Admin", desc: "Everything except the owner role" },
  editor: { label: "Editor", desc: "Hymns, hymnals and featured content" },
  moderator: { label: "Moderator", desc: "Reports, users and composer requests" },
}
const ORDER: AdminRole[] = ["owner", "admin", "editor", "moderator"]

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()

/** Settings → Team: who manages Exalto, pending invites, and inviting Admins by Google email. */
export function TeamPage() {
  const users = useUsers()
  const members = useMembers()
  const { role: myRole, user: me } = useAuth()
  const canManage = canManageTeam(myRole)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [toRemove, setToRemove] = useState<AppUser | null>(null)

  const team = users.data
    .filter((u) => (ADMIN_ROLES as string[]).includes(u.role))
    .sort((a, b) => ORDER.indexOf(a.role as AdminRole) - ORDER.indexOf(b.role as AdminRole) || a.displayName.localeCompare(b.displayName))
  const pending = members.data.filter((m) => m.status === "invited")

  const run = async (done: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      toast.success(done)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Page
      crumbs={[{ label: "System" }, { label: "Settings" }]}
      title="Settings"
      description="Who can manage Exalto."
      actions={canManage && <Button onClick={() => setInviteOpen(true)}><Plus /> Invite admin</Button>}
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Admin team</CardTitle>
          <CardDescription>
            {canManage ? "Owners and Admins can invite people by their Google email." : "Only owners and admins can change the team."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {users.loading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10" />)}
          {users.error && <p className="text-sm text-destructive">Couldn't load the team: {users.error.message}</p>}
          {team.map((u) => {
            const r = u.role as AdminRole
            const isMe = u.id === me?.uid
            const removable = canManage && !isMe && r !== "owner"
            return (
              <div key={u.id} className="flex items-center gap-3">
                <Avatar className="size-8">
                  {u.photoURL && <AvatarImage src={u.photoURL} alt="" />}
                  <AvatarFallback className={r === "owner" ? "bg-gradient-to-br from-[#04C1FF] to-[#EEA246] text-white" : undefined}>{initials(u.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.displayName}{isMe && <span className="text-muted-foreground"> (you)</span>}</div>
                  <div className="truncate text-xs text-muted-foreground">{ROLE_INFO[r].desc}</div>
                </div>
                <Badge variant={r === "owner" ? "default" : "secondary"}>{ROLE_INFO[r].label}</Badge>
                {removable && (
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${u.displayName} from the team`} onClick={() => setToRemove(u)}><X /></Button>
                )}
              </div>
            )
          })}
          {pending.length > 0 && (
            <>
              <div className="mt-2 text-xs font-medium text-muted-foreground">Pending invites</div>
              {pending.map((m) => (
                <div key={m.email} className="flex items-center gap-3">
                  <Avatar className="size-8"><AvatarFallback>{initials(m.email)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{m.email}</span>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">Invited</Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      Invited {formatWhen(m.invitedAt)}{m.invitedByName ? ` by ${m.invitedByName}` : ""} · not signed in yet
                    </div>
                  </div>
                  <Badge variant="secondary">{ROLE_INFO[m.role as AdminRole]?.label ?? m.role}</Badge>
                  {canManage && (
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Cancel the invite for ${m.email}`} onClick={() => void run(`Invite for ${m.email} cancelled`, () => revokeInvite(m.email))}><X /></Button>
                  )}
                </div>
              ))}
            </>
          )}
          {members.error && canManage && <p className="text-sm text-destructive">Couldn't load invites: {members.error.message}</p>}
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <Dialog open={Boolean(toRemove)} onOpenChange={(o) => !o && setToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {toRemove?.displayName} from the team?</DialogTitle>
            <DialogDescription>They become a listener and lose access to the admin and Hymn Studio (unless they're on the Studio access list). Their account stays.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                const u = toRemove
                setToRemove(null)
                if (u) void run(`${u.displayName} was removed from the team`, () => setUserRole(u, "listener"))
              }}
            >
              Remove from team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<TeamInviteRole>("admin")
  const [busy, setBusy] = useState(false)
  const clean = normalizeEmail(email)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const status = await inviteMember(clean, role)
      toast.success(status === "active" ? `${clean} is now an ${ROLE_INFO[role].label}.` : `Invite sent. ${clean} becomes an ${ROLE_INFO[role].label} when they first sign in.`)
      setEmail("")
      onOpenChange(false)
    } catch (err) {
      toast.error(`Couldn't invite: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={send} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite to the admin team</DialogTitle>
            <DialogDescription>They sign in with this Google account in the Exalto admin or Hymn Studio. The role applies the first time they sign in.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Google email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" required autoFocus />
          </label>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Role</span>
            <Select value={role} onValueChange={(v) => setRole(v as TeamInviteRole)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEAM_INVITE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_INFO[r].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_INFO[role].desc}. Only the church account can be owner.</p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" disabled={busy || !isEmail(clean)}>{busy && <Loader2 className="animate-spin" />} Send invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
