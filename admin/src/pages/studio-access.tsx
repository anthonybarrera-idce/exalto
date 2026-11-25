import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { canManageTeam, useAuth } from "@/lib/auth"
import { formatWhen } from "@/lib/format"
import { grantStudioAccess, isEmail, normalizeEmail, revokeStudioAccess, useStudioAccess, type StudioAccess } from "@/lib/studio-access"

export function StudioAccessPage() {
  const { data, loading, error } = useStudioAccess()
  const { role } = useAuth()
  const isOwner = canManageTeam(role)
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [toRemove, setToRemove] = useState<StudioAccess | null>(null)

  const clean = normalizeEmail(email)
  const exists = data.some((d) => d.email === clean)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await grantStudioAccess(clean, note)
      toast.success(`${clean} can now use Hymn Studio.`)
      setEmail("")
      setNote("")
    } catch (err) {
      toast.error(`Couldn't add: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!toRemove) return
    try {
      await revokeStudioAccess(toRemove.email)
      toast.success(`${toRemove.email} can no longer use Hymn Studio.`)
    } catch (err) {
      toast.error(`Couldn't remove: ${(err as Error).message}`)
    } finally {
      setToRemove(null)
    }
  }

  return (
    <Page
      crumbs={[{ label: "System" }, { label: "Studio access" }]}
      title="Studio access"
      description="Who can sign in to Hymn Studio, the desktop app for converting hymn slides. Owners, admins and editors can always use it."
    >
      {isOwner ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Google email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" className="w-72" required />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span></span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Music team" className="w-56" maxLength={80} />
          </label>
          <Button type="submit" disabled={busy || !isEmail(clean) || exists}>{exists ? "Already added" : "Give access"}</Button>
          <p className="basis-full text-xs text-muted-foreground">
            They sign in to Hymn Studio with this Google account. Removing someone locks the app for them the next time it checks (right away if it's open and online).
          </p>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins can change who has access.</p>
      )}

      {error && <p className="text-sm text-destructive">Couldn't load the list: {error.message}</p>}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8" /></TableCell></TableRow>
              ))}
            {!loading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Nobody yet besides owners, admins and editors.</TableCell>
              </TableRow>
            )}
            {data.map((d) => (
              <TableRow key={d.email}>
                <TableCell className="font-medium">{d.email}</TableCell>
                <TableCell className="text-muted-foreground">{d.note ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.addedByName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatWhen(d.addedAt)}</TableCell>
                <TableCell>
                  {isOwner && (
                    <Button variant="ghost" size="icon" aria-label={`Remove ${d.email}`} onClick={() => setToRemove(d)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(toRemove)} onOpenChange={(o) => !o && setToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {toRemove?.email}?</DialogTitle>
            <DialogDescription>They won't be able to use Hymn Studio. Hymns they already uploaded stay as they are.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={() => void remove()}>Remove access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
