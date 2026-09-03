import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Gamepad2, Lock, Mail } from "lucide-react";
import { Api } from "../api";
import { useAuth } from "./AuthContext";
import { Turnstile } from "./Turnstile";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(() => new URLSearchParams(location.search).get("error"));
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";
  const redirectTo = new URLSearchParams(location.search).get("next") || "/cards";

  useEffect(() => {
    Api.me().then((result) => setSiteKey(result.turnstileSiteKey));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isLogin) await Api.login(email, password, turnstileToken);
      else await Api.register(email, password, turnstileToken);
      await refresh();
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md py-8">
      <div className="rounded border border-black/10 bg-panel p-6 shadow-soft">
        <h1 className="text-2xl font-semibold">{isLogin ? "登录 ArcadeLink" : "注册 ArcadeLink"}</h1>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            邮箱
            <span className="flex items-center gap-2 rounded border border-black/10 bg-white px-3">
              <Mail size={18} className="text-ink/50" />
              <input
                className="min-h-12 flex-1 bg-transparent outline-none"
                value={email}
                type="email"
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            密码
            <span className="flex items-center gap-2 rounded border border-black/10 bg-white px-3">
              <Lock size={18} className="text-ink/50" />
              <input
                className="min-h-12 flex-1 bg-transparent outline-none"
                value={password}
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </span>
          </label>
          <Turnstile siteKey={siteKey} onToken={setTurnstileToken} />
          {error && <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
          <button className="focus-ring min-h-12 rounded bg-ink px-4 font-semibold text-white disabled:opacity-60" disabled={busy}>
            {busy ? "处理中..." : isLogin ? "登录" : "创建账号"}
          </button>
        </form>
        {isLogin && (
          <a
            className="focus-ring mt-3 flex min-h-12 items-center justify-center gap-2 rounded border border-black/15 bg-white px-4 font-semibold"
            href={`/api/auth/munet?next=${encodeURIComponent(redirectTo)}`}
          >
            <Gamepad2 size={18} />
            使用 MuNET 登录
          </a>
        )}
        <p className="mt-5 text-sm text-ink/60">
          {isLogin ? "还没有账号？" : "已经有账号？"}
          <Link className="ml-1 font-medium text-mint" to={`${isLogin ? "/register" : "/login"}?next=${encodeURIComponent(redirectTo)}`}>
            {isLogin ? "注册" : "登录"}
          </Link>
        </p>
      </div>
    </section>
  );
}
