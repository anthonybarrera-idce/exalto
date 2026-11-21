import { Fragment, type ReactNode } from "react"
import { Link, Outlet } from "react-router"

import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export function AdminLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

export type Crumb = { label: string; to?: string }

/** Page chrome: header bar with breadcrumbs, then a padded content column. */
export function Page({
  crumbs,
  title,
  description,
  actions,
  children,
}: {
  crumbs: Crumb[]
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((c, i) => (
              <Fragment key={c.label}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {i === crumbs.length - 1 || !c.to ? (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </>
  )
}
