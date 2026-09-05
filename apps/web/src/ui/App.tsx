import { lazy, Suspense, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Gamepad2, IdCard, LogOut, Shield, Store, UserRound } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthPage } from "./AuthPage";

const AdminPage = lazy(() => import("./AdminPage").then((module) => ({ default: module.AdminPage })));
const CardsPage = lazy(() => import("./CardsPage").then((module) => ({ default: module.CardsPage })));
const MachineLoginPage = lazy(() => import("./MachineLoginPage").then((module) => ({ default: module.MachineLoginPage })));
const MerchantPage = lazy(() => import("./MerchantPage").then((module) => ({ default: module.MerchantPage })));
const SettingsPage = lazy(() => import("./SettingsPage").then((module) => ({ default: module.SettingsPage })));

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-[#efede7]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-normal">
            <span className="grid size-9 place-items-center rounded bg-ink text-white">
              <Gamepad2 size={20} />
            </span>
            ArcadeLink
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavItem to="/cards" icon={<IdCard size={16} />} label="卡片" />
            {(user?.role === "merchant" || user?.role === "admin") && <NavItem to="/merchant" icon={<Store size={16} />} label="店家" />}
            {user?.role === "admin" && <NavItem to="/admin" icon={<Shield size={16} />} label="管理" />}
            {user && <NavItem to="/settings" icon={<UserRound size={16} />} label="账号" />}
            {user ? (
              <button onClick={logout} className="focus-ring grid size-10 place-items-center rounded text-ink hover:bg-black/5" title="退出登录">
                <LogOut size={18} />
              </button>
            ) : (
              <NavLink className="focus-ring rounded px-3 py-2 hover:bg-black/5" to="/login">
                登录
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Suspense fallback={<div className="rounded border border-black/10 bg-panel p-6">加载中...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/cards" replace />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/merchant" element={<MerchantPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/m/:publicId" element={<MachineLoginPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `focus-ring flex items-center gap-2 rounded px-3 py-2 hover:bg-black/5 ${isActive ? "bg-white shadow-sm" : ""}`
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}
