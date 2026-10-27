import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute, PublicOnly, RootRedirect } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { AdminAuthorsPage } from "@/pages/admin/AdminAuthorsPage";
import { AdminQueuePage } from "@/pages/admin/AdminQueuePage";
import { AdminTicketWorkspacePage } from "@/pages/admin/AdminTicketWorkspacePage";
import { AuthorBooks } from "@/pages/author/AuthorBooks";
import { AuthorDashboard } from "@/pages/author/AuthorDashboard";
import { AuthorTicketDetailPage } from "@/pages/author/AuthorTicketDetailPage";
import { AuthorTicketsPage } from "@/pages/author/AuthorTicketsPage";
import { NewTicketPage } from "@/pages/author/NewTicketPage";

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />

      <Route path="/" element={<RootRedirect />} />

      <Route element={<ProtectedRoute role="AUTHOR" />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<AuthorDashboard />} />
          <Route path="books" element={<AuthorBooks />} />
          <Route path="tickets" element={<AuthorTicketsPage />} />
          <Route path="tickets/new" element={<NewTicketPage />} />
          <Route path="tickets/:id" element={<AuthorTicketDetailPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="ADMIN" />}>
        <Route path="/admin" element={<AppShell />}>
          <Route index element={<AdminQueuePage />} />
          <Route path="tickets/:id" element={<AdminTicketWorkspacePage />} />
          <Route path="authors" element={<AdminAuthorsPage />} />
        </Route>
      </Route>

      <Route path="/author" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
