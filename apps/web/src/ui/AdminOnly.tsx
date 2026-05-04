import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { RequireLogin } from "./RequireLogin";
import { useAuth } from "./AuthContext";

export function AdminOnly({ children }: { children: ReactNode }) {
  return (
    <RequireLogin>
      <AdminGate>{children}</AdminGate>
    </RequireLogin>
  );
}

function AdminGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "admin") return <Navigate to="/cards" replace />;
  return children;
}
