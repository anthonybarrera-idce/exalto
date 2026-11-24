import type { ReactNode } from "react"

export function PageHeader({ title, sub, badge, children }: { title: string; sub: string; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{children}</div>
}
