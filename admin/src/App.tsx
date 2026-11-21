import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AdminLayout } from "@/components/admin-layout"
import { RequireAdmin } from "@/components/require-admin"
import { AuditLogPage } from "@/pages/audit-log"
import { ComingSoonPage } from "@/pages/coming-soon"
import { DashboardPage } from "@/pages/dashboard"
import { HymnEditorPage } from "@/pages/hymn-editor"
import { HymnsPage } from "@/pages/hymns"
import { LoginPage } from "@/pages/login"

const LATER: { path: string; group: string; title: string; description: string }[] = [
  { path: "hymnals", group: "Content", title: "Hymnals", description: "Collections shown in the Himnario picker." },
  { path: "recordings", group: "Content", title: "Recordings", description: "Audio versions of hymns." },
  { path: "featured", group: "Content", title: "Featured", description: "Hymn of the Day and Discover sections." },
  { path: "users", group: "Community", title: "Users", description: "Everyone with an Exalto account." },
  { path: "composer-requests", group: "Community", title: "Composer requests", description: "People asking to upload hymns." },
  { path: "reports", group: "Community", title: "Reports", description: "Content flagged by people in the app." },
  { path: "settings", group: "System", title: "Settings", description: "Admin team and app settings." },
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
          <Route path="hymns/:id" element={<HymnEditorPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          {LATER.map((p) => (
            <Route key={p.path} path={p.path} element={<ComingSoonPage {...p} />} />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
