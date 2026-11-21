import { Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { Navigate } from "react-router"

import { useAuth } from "@/lib/auth"

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (!user || !role) return <Navigate to="/login" replace />
  return children
}
