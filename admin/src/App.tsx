import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AdminLayout } from "@/components/admin-layout"
import { RequireAdmin } from "@/components/require-admin"
import { AuditLogPage } from "@/pages/audit-log"
import { ComingSoonPage } from "@/pages/coming-soon"
import { DashboardPage } from "@/pages/dashboard"
import { HymnEditorPage } from "@/pages/hymn-editor"
import { HymnalsPage } from "@/pages/hymnals"
import { HymnsPage } from "@/pages/hymns"
import { LoginPage } from "@/pages/login"
import { StudioAccessPage } from "@/pages/studio-access"
import { TeamPage } from "@/pages/team"
import { UsersPage } from "@/pages/users"

const LATER: { path: string; group: string; title: string; description: string }[] = [
  { path: "recordings", group: "Content", title: "Recordings", description: "Audio versions of hymns." },
  { path: "featured", group: "Content", title: "Featured", description: "Hymn of the Day and Discover sections." },
  { path: "composer-requests", group: "Community", title: "Composer requests", description: "People asking to upload hymns." },
  { path: "reports", group: "Community", title: "Reports", description: "Content flagged by people in the app." },
]

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="hymns" element={<HymnsPage />} />
          <Route path="hymnals" element={<HymnalsPage />} />
          <Route path="hymns/:id" element={<HymnEditorPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="studio-access" element={<StudioAccessPage />} />
          <Route path="settings" element={<TeamPage />} />
          {LATER.map((p) => (
            <Route key={p.path} path={p.path} element={<ComingSoonPage {...p} />} />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
