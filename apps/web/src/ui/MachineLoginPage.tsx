import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Fingerprint, Gamepad2, Loader2, LocateFixed, ShieldAlert } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { Api, type Card, type PublicMachine } from "../api";
import { passkeyErrorMessage } from "../passkeys";
import { useAuth } from "./AuthContext";

export function MachineLoginPage() {
  const { publicId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const ticket = searchParams.get("ticket") || "";
  const queryError = searchParams.get("error");
  const { user, loading, refresh } = useAuth();
  const [machine, setMachine] = useState<PublicMachine | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState<"idle" | "locating" | "sending" | "sent">("idle");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    if (queryError) {
      setError(queryError);
      return;
    }
    if (!ticket) {
      setError("本次会话已失效，请重新扫描机台二维码或触碰 NFC 标签");
      return;
    }
    Api.publicMachine(publicId, ticket)
      .then((result) => setMachine(result.machine))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "没有找到这台机台"));
  }, [publicId, ticket, queryError]);

  useEffect(() => {
    if (!user) return;
    Api.cards().then((result) => {
      const activeCards = result.cards.filter((card) => !card.disabledAt);
      setCards(activeCards);
    });
  }, [user]);

  const title = machine ? `${machine.shop.name} / ${machine.name}` : "ArcadeLink";

  const loginWithPasskey = async () => {
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const response = await startAuthentication({ optionsJSON: await Api.passkeyOptions() });
      await Api.loginWithPasskey(response);
      await refresh();
    } catch (caught) {
      setPasskeyError(passkeyErrorMessage(caught));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const loginWithCard = async (cardId: string) => {
    if (status !== "idle") return;
    if (!ticket) {
      setError("本次会话已失效，请重新扫描机台二维码或触碰 NFC 标签");
      return;
    }
    setError(null);
    setActiveCardId(cardId);
    setStatus("locating");
    try {
      const position = await getPosition();
      setStatus("sending");
      await Api.loginMachine(publicId, {
        cardId,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        ticket,
      });
      window.history.replaceState(null, "", `/m/${publicId}?expired=1`);
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      setActiveCardId(null);
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后再试");
    }
  };

  if (loading) return <Panel>加载中...</Panel>;
  if (error && !machine) {
    return (
      <Panel>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded bg-coral/10 text-coral">
            <ShieldAlert size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">无法进入机台会话</h2>
            <p className="mt-1 text-sm text-ink/70">{error}</p>
          </div>
        </div>
      </Panel>
    );
  }

  const munetNext = `/m/${publicId}${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ""}`;

  return (
    <section className="mx-auto max-w-lg py-3">
      <div className="rounded border border-black/10 bg-panel p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded bg-ink text-white">
            <Gamepad2 size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          </div>
        </div>

        {!user ? (
          <div className="mt-8 grid gap-3">
            <p className="text-sm font-medium text-ink/70">请登录后直接刷卡：</p>
            {passkeyError && (
              <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
                {passkeyError}
              </p>
            )}
            <a
              className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded bg-ink px-4 font-semibold text-white"
              href={`/api/auth/munet?next=${encodeURIComponent(munetNext)}`}
            >
              <Gamepad2 size={18} />
              使用 MuNET 继续
            </a>
            {browserSupportsWebAuthn() && (
              <button
                className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded border border-black/15 bg-white px-4 font-semibold disabled:opacity-60"
                disabled={passkeyBusy}
                onClick={loginWithPasskey}
              >
                <Fingerprint size={18} />
                {passkeyBusy ? "正在验证 Passkey..." : "使用 Passkey 登录"}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink/70">点击卡片直接登录：</p>
              <Link to="/cards" className="text-xs text-mint hover:underline">
                管理卡片
              </Link>
            </div>

            {error && (
              <p className="flex items-center gap-2 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
                <ShieldAlert size={16} className="shrink-0" />
                {error}
              </p>
            )}

            {cards.length === 0 ? (
              <div className="rounded border border-dashed border-black/20 bg-white p-6 text-center">
                <p className="text-sm text-ink/60">还没有添加卡片</p>
                <Link
                  className="focus-ring mt-3 inline-flex items-center gap-1 rounded bg-ink px-4 py-2 text-sm font-medium text-white"
                  to="/cards"
                >
                  先添加一张卡片
                </Link>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {cards.map((card) => {
                  const isThisCard = activeCardId === card.id;
                  const isBusy = status !== "idle" && isThisCard;
                  const isSuccess = status === "sent" && isThisCard;
                  const isDisabled = status !== "idle" && !isThisCard;

                  return (
                    <button
                      key={card.id}
                      type="button"
                      disabled={status !== "idle"}
                      onClick={() => loginWithCard(card.id)}
                      className={`focus-ring flex min-h-16 w-full items-center justify-between gap-3 rounded border p-4 text-left transition-all ${
                        isSuccess
                          ? "border-mint bg-mint/10 text-mint"
                          : isThisCard
                          ? "border-ink bg-white shadow-soft"
                          : "border-black/10 bg-white hover:border-black/25 hover:shadow-soft"
                      } disabled:cursor-not-allowed ${isDisabled ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded ${
                            isSuccess ? "bg-mint text-white" : "bg-panel text-ink"
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 size={20} />
                          ) : isBusy ? (
                            <Loader2 size={20} className="animate-spin text-ink/60" />
                          ) : (
                            <CreditCard size={20} />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{card.label}</p>
                          <p className="font-mono text-xs text-ink/50">尾号 {card.accessCode.slice(-4)}</p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {isSuccess ? (
                          <span className="text-sm font-semibold text-mint">已为你登录</span>
                        ) : isThisCard && status === "locating" ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-ink/70">
                            <LocateFixed size={14} className="animate-pulse" />
                            确认位置...
                          </span>
                        ) : isThisCard && status === "sending" ? (
                          <span className="text-xs font-medium text-ink/70">正在登录...</span>
                        ) : (
                          <span className="focus-ring inline-flex items-center gap-1 rounded bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                            <LocateFixed size={14} />
                            点击登录
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg rounded border border-black/10 bg-panel p-6 shadow-soft">{children}</div>;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("当前浏览器无法确认你的位置"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 15_000,
    });
  });
}
