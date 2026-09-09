import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Fingerprint, Gamepad2, Loader2, LocateFixed, ShieldAlert } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { Api, type Card, type PublicMachine } from "../api";
import { passkeyErrorMessage } from "../passkeys";
import { useAuth } from "./AuthContext";

export function MachineLoginPage() {
  const { ticket: paramTicket = "", publicId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const ticket = searchParams.get("ticket") || paramTicket || publicId;
  const queryError = searchParams.get("error");
  const { user, loading, refresh } = useAuth();
  const [machine, setMachine] = useState<PublicMachine | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState<"idle" | "locating" | "sending" | "sent" | "destroyed">("idle");
  const [countdown, setCountdown] = useState(3);
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
      setError("本次会话已失效");
      return;
    }
    Api.publicMachine(ticket)
      .then((result) => setMachine(result.machine))
      .catch(() => setError("机台不可用"));
  }, [ticket, queryError]);

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
      setError("本次会话已失效");
      return;
    }
    setError(null);
    setActiveCardId(cardId);
    setStatus("locating");
    try {
      const position = await getPosition();
      setStatus("sending");
      await Api.loginMachine({
        cardId,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        ticket,
      });
      window.history.replaceState(null, "", "/m?expired=1");
      setCountdown(3);
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      setActiveCardId(null);
      setError(friendlyLoginError(caught));
    }
  };

  useEffect(() => {
    if (status !== "sent") return;
    if (countdown <= 0) {
      setStatus("destroyed");
      setCards([]);
      setActiveCardId(null);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [status, countdown]);

  if (loading) return <Panel>加载中...</Panel>;
  if (status === "destroyed") {
    return (
      <section className="mx-auto max-w-lg py-3">
        <div className="rounded border border-ink/10 bg-panel p-6 shadow-soft text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-mint/10 text-mint mb-4">
            <CheckCircle2 size={32} />
          </span>
          <h2 className="text-xl font-semibold text-ink">本次会话已结束</h2>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.close()}
              className="focus-ring inline-flex items-center justify-center rounded bg-ink px-5 py-2.5 text-sm font-semibold text-canvas hover:bg-ink/90"
            >
              关闭此页面
            </button>
          </div>
        </div>
      </section>
    );
  }
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

  const munetNext = ticket ? `/m?ticket=${encodeURIComponent(ticket)}` : "/m";

  return (
    <section className="mx-auto max-w-lg py-3">
      <div className="rounded border border-ink/10 bg-panel p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded bg-ink text-canvas">
            {machine?.shop.logoUrl ? (
              <img src={machine.shop.logoUrl} alt={`${machine.shop.name} Logo`} className="size-full object-cover" />
            ) : (
              <Gamepad2 size={24} />
            )}
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          </div>
        </div>

        {!user ? (
          <div className="mt-8 grid gap-3">
            <p className="text-sm font-medium text-ink/70">登录账号后即可登录：</p>
            {passkeyError && (
              <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
                {passkeyError}
              </p>
            )}
            <a
              className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded bg-ink px-4 font-semibold text-canvas"
              href={`/api/auth/munet?next=${encodeURIComponent(munetNext)}`}
            >
              <img src="/munet-logo.png" alt="" className="size-5 object-contain" />
              使用 MuNET 登录
            </a>
            {browserSupportsWebAuthn() && (
              <button
                className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded border border-ink/15 bg-surface px-4 font-semibold text-ink disabled:opacity-60"
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
              <p className="text-sm font-medium text-ink/70">选择卡片</p>
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
              <div className="rounded border border-dashed border-ink/20 bg-surface p-6 text-center">
                <p className="text-sm text-ink/60">还没有添加卡片</p>
                <Link
                  className="focus-ring mt-3 inline-flex items-center gap-1 rounded bg-ink px-4 py-2 text-sm font-medium text-canvas"
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
                          ? "border-ink bg-surface shadow-soft"
                          : "border-ink/10 bg-surface hover:border-ink/25 hover:shadow-soft"
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
                            status === "locating" ? (
                              <LocateFixed size={20} className="animate-pulse text-ink/60" />
                            ) : (
                              <Loader2 size={20} className="animate-spin text-ink/60" />
                            )
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
                          <span className="text-sm font-semibold text-mint">已登录 ({countdown}s)</span>
                        ) : isBusy ? (
                          status === "locating" ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-ink/70">
                              <LocateFixed size={14} className="animate-pulse" />
                              确认位置...
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-medium text-ink/70">
                              <Loader2 size={14} className="animate-spin" />
                              正在登录...
                            </span>
                          )
                        ) : (
                          <span className="focus-ring inline-flex items-center gap-1 rounded bg-ink px-3.5 py-1.5 text-xs font-semibold text-canvas">
                            <CreditCard size={14} />
                            登录
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
  return <div className="mx-auto max-w-lg rounded border border-ink/10 bg-panel p-6 shadow-soft">{children}</div>;
}

function friendlyLoginError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === "geo_denied") return "需要定位权限";
    if (msg === "geo_unsupported" || msg === "geo_failed") return "定位获取失败";
    if (msg.includes("店内") || msg.includes("距离") || msg.includes("到店") || msg.includes("位置确认失败")) {
      return "请到店再进行登录";
    }
    if (msg.includes("会话已失效") || msg.includes("缺少会话凭证")) {
      return "本次会话已失效";
    }
    if (msg.includes("频繁")) {
      return "操作过于频繁，请稍后重试";
    }
    if (msg.includes("无法完成此操作") || msg.includes("当前无法进行此操作") || msg.includes("受限")) {
      return "当前无法进行此操作";
    }
    if (msg.includes("卡片")) {
      return "卡片不可用或已失效";
    }
    if (msg.includes("机台") || msg.includes("通信") || msg.includes("响应") || msg.includes("502")) {
      return "机台暂时不可用，请稍后重试";
    }
  }
  return "登录失败，请稍后重试";
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geo_unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error("geo_denied"));
      } else {
        reject(new Error("geo_failed"));
      }
    }, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 15_000,
    });
  });
}
