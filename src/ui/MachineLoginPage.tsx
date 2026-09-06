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
      setError("本次会话已失效，请重新触碰机台 NFC 标签");
      return;
    }
    Api.publicMachine(publicId, ticket)
      .then((result) => setMachine(result.machine))
      .catch(() => setError("机台暂时不可用，请稍后重试"));
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
      setError("本次会话已失效，请重新触碰机台 NFC 标签");
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
          <h2 className="text-xl font-semibold text-ink">已刷卡，请查看机台屏幕</h2>
          <p className="mt-2 text-sm text-ink/70">
            本次会话已结束。若机台屏幕未识别，请重新触碰机台 NFC 标签。
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                window.close();
                setTimeout(() => {
                  alert("由于浏览器安全限制无法直接关闭页面，您可以直接离开或关闭当前标签页。");
                }, 300);
              }}
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
            <h2 className="text-lg font-semibold text-ink">暂时无法刷卡</h2>
            <p className="mt-1 text-sm text-ink/70">{error}</p>
          </div>
        </div>
      </Panel>
    );
  }

  const munetNext = `/m/${publicId}${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ""}`;

  return (
    <section className="mx-auto max-w-lg py-3">
      <div className="rounded border border-ink/10 bg-panel p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded bg-ink text-canvas">
            <Gamepad2 size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          </div>
        </div>

        {!user ? (
          <div className="mt-8 grid gap-3">
            <p className="text-sm font-medium text-ink/70">登录账号后即可刷卡：</p>
            {passkeyError && (
              <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
                {passkeyError}
              </p>
            )}
            <a
              className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded bg-ink px-4 font-semibold text-canvas"
              href={`/api/auth/munet?next=${encodeURIComponent(munetNext)}`}
            >
              <Gamepad2 size={18} />
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
              <p className="text-sm font-medium text-ink/70">点击卡片直接刷卡：</p>
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

            {status === "sent" && (
              <div className="flex items-center justify-between rounded border border-mint/30 bg-mint/10 px-3.5 py-2.5 text-sm text-mint">
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 size={16} />
                  已刷卡，请查看机台屏幕
                </span>
                <span className="text-xs font-semibold">{countdown} 秒后关闭会话</span>
              </div>
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
                          <span className="text-sm font-semibold text-mint">已刷卡 ({countdown}s)</span>
                        ) : isBusy ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-ink/70">
                            <Loader2 size={14} className="animate-spin" />
                            正在刷卡...
                          </span>
                        ) : (
                          <span className="focus-ring inline-flex items-center gap-1 rounded bg-ink px-3.5 py-1.5 text-xs font-semibold text-canvas">
                            <CreditCard size={14} />
                            点击刷卡
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
    if (err.message === "geo_denied") return "请允许获取位置权限以确认在店内";
    if (err.message === "geo_unsupported" || err.message === "geo_failed") return "无法确认你的位置，请检查手机定位";
    if (err.message.includes("请到店内") || err.message.includes("位置确认失败")) {
      return "不在机厅允许的距离范围内，请靠近机台再试";
    }
    if (err.message.includes("会话已失效") || err.message.includes("缺少会话凭证")) {
      return "本次会话已失效，请重新触碰机台 NFC 标签";
    }
  }
  return "刷卡未成功，请稍后重试或联系店员";
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
