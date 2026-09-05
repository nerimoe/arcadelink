import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Api, type AuthIdentity, type Passkey } from "../api";
import { passkeyErrorMessage } from "../passkeys";
import { RequireLogin } from "./RequireLogin";

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [identities, setIdentities] = useState<AuthIdentity[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyNames, setPasskeyNames] = useState<Record<string, string>>({});
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedSetup = useRef(false);
  const setup = new URLSearchParams(location.search).get("setup") === "passkey";
  const next = new URLSearchParams(location.search).get("next") || "/cards";

  const load = useCallback(async () => {
    const account = await Api.account();
    setIdentities(account.identities);
    setPasskeys(account.passkeys);
    setPasskeyNames(Object.fromEntries(account.passkeys.map((passkey) => [passkey.id, passkey.name])));
  }, []);

  const addPasskey = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await startRegistration({ optionsJSON: await Api.passkeyRegistrationOptions() });
      await Api.registerPasskey(response, newPasskeyName.trim() || undefined);
      setNewPasskeyName("");
      await load();
      if (setup) navigate(next, { replace: true });
    } catch (caught) {
      setError(passkeyErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [load, navigate, newPasskeyName, next, setup]);

  useEffect(() => {
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : "无法加载账号设置"));
  }, [load]);

  useEffect(() => {
    if (!setup || attemptedSetup.current || !browserSupportsWebAuthn()) return;
    attemptedSetup.current = true;
    void addPasskey();
  }, [addPasskey, setup]);

  return (
    <RequireLogin>
      <section className="mx-auto grid max-w-2xl gap-6">
        <div>
          <h1 className="text-2xl font-semibold">账号设置</h1>
          {error && <p className="mt-4 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
        </div>

        <section className="rounded border border-black/10 bg-panel p-5">
          <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={18} />登录身份</h2>
          <div className="mt-4 grid gap-2">
            {identities.map((identity) => (
              <div key={identity.id} className="rounded border border-black/10 bg-white p-3">
                <p className="font-medium">{identity.provider === "munet" ? "MuNET" : identity.provider}</p>
                <p className="mt-1 text-sm text-ink/60">{identity.displayName || identity.username || "已连接"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-black/10 bg-panel p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Fingerprint size={18} />Passkey</h2>
          {browserSupportsWebAuthn() && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className="focus-ring min-h-10 min-w-0 flex-1 rounded border border-black/10 bg-white px-3 text-sm"
                placeholder="名称（可选，默认自动识别）"
                maxLength={60}
                value={newPasskeyName}
                onChange={(event) => setNewPasskeyName(event.target.value)}
              />
              <button className="focus-ring flex min-h-10 items-center justify-center gap-2 rounded bg-ink px-3 text-sm font-medium text-white disabled:opacity-60" disabled={busy} onClick={addPasskey}>
                <Plus size={16} />
                添加 Passkey
              </button>
            </div>
          )}
          <div className="mt-4 grid gap-2">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center justify-between gap-3 rounded border border-black/10 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <input
                    aria-label="Passkey 名称"
                    className="focus-ring min-h-9 w-full rounded border border-black/10 bg-panel px-2 font-medium"
                    maxLength={60}
                    value={passkeyNames[passkey.id] ?? passkey.name}
                    onChange={(event) => setPasskeyNames((current) => ({ ...current, [passkey.id]: event.target.value }))}
                  />
                  <p className="mt-1 text-sm text-ink/60">
                    {passkey.providerName || "未知提供方"} · {passkey.backedUp ? "已同步" : "此设备"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="focus-ring grid size-9 place-items-center rounded text-mint hover:bg-mint/10 disabled:opacity-40"
                    title="保存名称"
                    disabled={!passkeyNames[passkey.id]?.trim() || passkeyNames[passkey.id]?.trim() === passkey.name}
                    onClick={async () => {
                      const name = passkeyNames[passkey.id]?.trim();
                      if (!name) return;
                      await Api.renamePasskey(passkey.id, name);
                      await load();
                    }}
                  >
                    <Save size={16} />
                  </button>
                  <button
                    className="focus-ring grid size-9 place-items-center rounded text-coral hover:bg-coral/10"
                    title="删除 Passkey"
                    onClick={async () => {
                      await Api.deletePasskey(passkey.id);
                      await load();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {!browserSupportsWebAuthn() && <p className="text-sm text-ink/60">当前设备不支持 Passkey。</p>}
          </div>
          {setup && <Link className="mt-4 inline-flex text-sm font-medium text-mint" to={next} replace>稍后设置</Link>}
        </section>
      </section>
    </RequireLogin>
  );
}
