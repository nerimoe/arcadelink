import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { Api } from "../api";
import { passkeyErrorMessage } from "../passkeys";
import { useAuth } from "./AuthContext";

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [munetBusy, setMunetBusy] = useState(false);
  const error = passkeyError || new URLSearchParams(location.search).get("error");
  const redirectTo = new URLSearchParams(location.search).get("next") || "/cards";

  const loginWithPasskey = async () => {
    setBusy(true);
    setPasskeyError(null);
    try {
      const response = await startAuthentication({ optionsJSON: await Api.passkeyOptions() });
      await Api.loginWithPasskey(response);
      await refresh();
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setPasskeyError(passkeyErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-[480px] py-10 sm:py-20">
      <div className="session-task !mt-0">
        <h1>登录 ArcadeLink</h1>
        <p className="session-subtitle">连接账号，随时管理你的卡片</p>
        {error && <p role="alert" className="session-error">{error}</p>}
      </div>
      <div className="session-actions">
        <button className="session-action primary" disabled={busy || munetBusy} onClick={() => {
          setMunetBusy(true);
          window.location.assign(`/api/auth/munet?next=${encodeURIComponent(redirectTo)}`);
        }}>
          {munetBusy && <Loader2 size={20} className="animate-spin" />}
          {munetBusy ? "正在连接 MuNET…" : "使用 MuNET 登录"}
        </button>
        <button className="session-action" disabled={busy || munetBusy || !browserSupportsWebAuthn()} onClick={() => void loginWithPasskey()}>
          {busy && <Loader2 size={20} className="animate-spin" />}
          {busy ? "正在验证 Passkey…" : "使用 Passkey 登录"}
        </button>
      </div>
    </section>
  );
}
