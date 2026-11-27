import { Check, ExternalLink, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Page } from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { canManageTeam, useAuth } from "@/lib/auth"
import { approveComposerRequest, declineComposerRequest, safeSampleUrl, usePendingComposerRequests, type ComposerRequest } from "@/lib/composer-requests"
import { formatWhen } from "@/lib/format"

type Pending = { request: ComposerRequest; action: "approve" | "decline" }

export function ComposerRequestsPage() {
  const { data, loading, error } = usePendingComposerRequests()
  const { role } = useAuth()
  const canReview = canManageTeam(role)
  const [confirm, setConfirm] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!confirm) return
    const { request: r, action } = confirm
    setBusy(true)
    try {
      if (action === "approve") {
        await approveComposerRequest(r)
        toast.success(`${r.displayName} is now a composer.`)
      } else {
        await declineComposerRequest(r)
        toast.success(`Declined ${r.displayName}'s request.`)
      }
      setConfirm(null)
    } catch (err) {
      toast.error(`Couldn't ${action}: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      crumbs={[{ label: "Community" }, { label: "Composer requests" }]}
      title="Composer requests"
      description="People asking to upload their own hymns from the Exalto app. Approving makes them a composer: they can create their own hymnals and manage only their own hymns."
    >
      {!canReview && <p className="text-sm text-muted-foreground">Only owners and admins can approve or decline requests.</p>}
      {error && <p className="text-sm text-destructive">Couldn't load requests: {error.message}</p>}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>About</TableHead>
              <TableHead>Sample</TableHead>
              <TableHead>Requested</TableHead>
              {canReview && <TableHead className="w-48" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8" /></TableCell></TableRow>
              ))}
            {!loading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No pending requests.</TableCell>
              </TableRow>
            )}
            {data.map((r) => {
              const sample = safeSampleUrl(r.sampleUrl)
              return (
                <TableRow key={r.uid} className="align-top">
                  <TableCell>
                    <div className="font-medium">{r.displayName}</div>
                    {r.handle && <div className="text-xs text-muted-foreground">@{r.handle}</div>}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap break-words text-muted-foreground">{r.about}</TableCell>
                  <TableCell>
                    {sample ? (
                      <a href={sample} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                        Open <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground" title={r.createdAt?.toDate().toLocaleString("en")}>
                    {formatWhen(r.createdAt)}
                  </TableCell>
                  {canReview && (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setConfirm({ request: r, action: "decline" })}>
                          <X className="size-4" /> Decline
                        </Button>
                        <Button size="sm" onClick={() => setConfirm({ request: r, action: "approve" })}>
                          <Check className="size-4" /> Approve
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === "approve" ? `Make ${confirm.request.displayName} a composer?` : `Decline ${confirm?.request.displayName}'s request?`}
            </DialogTitle>
            <DialogDescription>
              {confirm?.action === "approve"
                ? "They'll be able to create their own hymnals and upload and manage their own hymns. You can change their role later on the Users page."
                : "Their role doesn't change. They can withdraw this request and send a new one from the app."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancel</Button></DialogClose>
            <Button variant={confirm?.action === "decline" ? "destructive" : "default"} disabled={busy} onClick={() => void run()}>
              {confirm?.action === "approve" ? "Approve" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
