import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Fingerprint, Gamepad2 } from "lucide-react";
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
    <section className="mx-auto max-w-md py-8">
      <div className="rounded border border-ink/10 bg-panel p-6 shadow-soft">
        <h1 className="text-2xl font-semibold">登录 ArcadeLink</h1>
        {error && <p className="mt-5 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
        <a
          className="focus-ring mt-6 flex min-h-12 items-center justify-center gap-2 rounded bg-ink px-4 font-semibold text-canvas"
          href={`/api/auth/munet?next=${encodeURIComponent(redirectTo)}`}
        >
          <Gamepad2 size={18} />
          使用 MuNET 继续
        </a>
        {browserSupportsWebAuthn() && (
          <button
            className="focus-ring mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded border border-ink/15 bg-surface px-4 font-semibold text-ink disabled:opacity-60"
            disabled={busy}
            onClick={loginWithPasskey}
          >
            <Fingerprint size={18} />
            使用 Passkey 登录
          </button>
        )}
      </div>
    </section>
  );
}
