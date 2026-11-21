import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { HymnStatus } from "@/lib/types"

const STYLES: Record<HymnStatus, { label: string; className: string }> = {
  published: { label: "Published", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  draft: { label: "Draft", className: "bg-secondary text-secondary-foreground" },
  review: { label: "In review", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  hidden: { label: "Hidden", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
}

export function HymnStatusBadge({ status }: { status: HymnStatus }) {
  const s = STYLES[status]
  return (
    <Badge variant="secondary" className={cn("gap-1.5", s.className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  )
}

export const STATUS_OPTIONS = Object.entries(STYLES).map(([value, s]) => ({ value: value as HymnStatus, label: s.label }))
