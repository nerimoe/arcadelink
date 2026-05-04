import { lazy, Suspense, type ReactNode } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { Gamepad2, IdCard, LogOut, MapPin, Shield, Store } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthPage } from "./AuthPage";

const AdminPage = lazy(() => import("./AdminPage").then((module) => ({ default: module.AdminPage })));
const CardsPage = lazy(() => import("./CardsPage").then((module) => ({ default: module.CardsPage })));
const MachineLoginPage = lazy(() => import("./MachineLoginPage").then((module) => ({ default: module.MachineLoginPage })));
const MerchantPage = lazy(() => import("./MerchantPage").then((module) => ({ default: module.MerchantPage })));

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
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/merchant" element={<MerchantPage />} />
            <Route path="/merchant/shops/:id" element={<MerchantPage />} />
            <Route path="/admin" element={<AdminPage />} />
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

function Home() {
  return (
    <section className="grid gap-6 py-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
      <div>
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-mint">
          <MapPin size={16} />
          扫一扫，快速登录机台
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-normal text-ink md:text-5xl">
          ArcadeLink
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-ink/70">
          为游戏厅和音游窝准备的到店登录工具。玩家扫码后选择自己的卡片，确认在店内后即可开始游玩。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="focus-ring rounded bg-ink px-5 py-3 font-medium text-white" to="/cards">
            管理卡片
          </Link>
        </div>
      </div>
      <div className="rounded border border-black/10 bg-panel p-5 shadow-soft">
        <div className="grid gap-3">
          {["每台机都有专属入口", "下次到店不用重复登录", "到店后才能使用", "卡片安全发送到机台"].map((item) => (
            <div key={item} className="rounded border border-black/10 bg-white p-4 font-medium">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
