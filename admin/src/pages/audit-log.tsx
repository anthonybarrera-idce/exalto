import { Page } from "@/components/admin-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatWhen } from "@/lib/format"
import { useAuditLog } from "@/lib/hymns"

export function AuditLogPage() {
  const { data, loading } = useAuditLog(100)
  return (
    <Page crumbs={[{ label: "System" }, { label: "Audit log" }]} title="Audit log" description="Every admin change, newest first.">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={3}><Skeleton className="h-5" /></TableCell>
              </TableRow>
            )}
            {!loading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No changes yet.</TableCell>
              </TableRow>
            )}
            {data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.actorName}</TableCell>
                <TableCell>{e.action} {e.target}</TableCell>
                <TableCell className="text-muted-foreground">{formatWhen(e.at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Page>
  )
}
