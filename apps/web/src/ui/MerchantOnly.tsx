import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { RequireLogin } from "./RequireLogin";
import { useAuth } from "./AuthContext";

export function MerchantOnly({ children }: { children: ReactNode }) {
  return (
    <RequireLogin>
      <MerchantGate>{children}</MerchantGate>
    </RequireLogin>
  );
}

function MerchantGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "merchant" && user.role !== "admin") return <Navigate to="/cards" replace />;
  return children;
}
