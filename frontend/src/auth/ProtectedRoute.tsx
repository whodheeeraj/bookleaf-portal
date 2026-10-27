import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { FullPageLoader } from "@/components/ui/Spinner";
import type { Role } from "@/lib/types";

export function ProtectedRoute({ role }: { role?: Role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label="Opening your workspace" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "ADMIN" ? "/admin" : "/app"} replace />;
  }
  return <Outlet />;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader label="Checking your session" />;
  if (user) return <Navigate to={user.role === "ADMIN" ? "/admin" : "/app"} replace />;
  return <>{children}</>;
}

export function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader label="Opening your workspace" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "ADMIN" ? "/admin" : "/app"} replace />;
}
