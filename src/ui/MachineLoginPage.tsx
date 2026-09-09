import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Loader2 } from "lucide-react";
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
  const [cardsLoading, setCardsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "locating" | "sending" | "sent" | "destroyed">("idle");
  const [countdown, setCountdown] = useState(3);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);
  const [munetBusy, setMunetBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    setHeroFailed(false);
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
      .catch(() => setError("这台机台暂时不可用，请稍后重试"));
  }, [ticket, queryError]);

  useEffect(() => {
    if (!user || !machine) {
      setCards([]);
      setCardsLoading(false);
      return;
    }
    setCardsLoading(true);
    Api.cards().then((result) => {
      const activeCards = result.cards.filter((card) => !card.disabledAt);
      setCards(activeCards);
    }).catch(() => setError("无法加载卡片"))
      .finally(() => setCardsLoading(false));
  }, [machine, user, reload]);

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

  const munetNext = ticket ? `/m?ticket=${encodeURIComponent(ticket)}` : "/m";
  const busy = status !== "idle";
  const completed = status === "destroyed";
  const title = completed ? "本次登录已完成" : user ? "选择卡片" : "登录 ArcadeLink";

  return (
    <section className="machine-session" aria-busy={loading || (!machine && !error)}>
      {machine ? (
        <header className="machine-hero">
          {machine.shop.heroUrl && !heroFailed && <img src={machine.shop.heroUrl} alt="" decoding="async" onError={() => setHeroFailed(true)} />}
          <div className="machine-hero-info">
            <h1>{machine.shop.name}</h1>
            <p>{machine.name}</p>
          </div>
        </header>
      ) : !error ? <div className="machine-hero session-skeleton" role="status" aria-label="正在加载机台信息" /> : null}

      <div className="session-task">
        <h2>{!machine ? error ? "无法进入机台会话" : "正在加载…" : title}</h2>
        {machine && !completed && <p className="session-subtitle">{user ? "选择用于这次机台登录的卡片" : "登录后选择用于这台机台的卡片"}</p>}
        <div aria-live="polite" aria-atomic="true">
          {(error || passkeyError) && <p className="session-error">{error || passkeyError}</p>}
          {completed && <p className="session-subtitle">可以关闭此页面</p>}
        </div>
      </div>

      {machine && !completed && !loading && (!user ? (
        <div className="session-actions">
          <button className="session-action primary" disabled={passkeyBusy || munetBusy} onClick={() => {
            setMunetBusy(true);
            window.location.assign(`/api/auth/munet?next=${encodeURIComponent(munetNext)}`);
          }}>
            {munetBusy && <Loader2 size={20} className="animate-spin" />}
            {munetBusy ? "正在连接 MuNET…" : "使用 MuNET 登录"}
          </button>
          <button className="session-action" disabled={passkeyBusy || munetBusy || !browserSupportsWebAuthn()} onClick={() => void loginWithPasskey()}>
            {passkeyBusy && <Loader2 size={20} className="animate-spin" />}
            {passkeyBusy ? "正在验证 Passkey…" : "使用 Passkey 登录"}
          </button>
          {!browserSupportsWebAuthn() && <p className="session-subtitle text-center">当前浏览器不支持 Passkey，请使用 MuNET 登录</p>}
        </div>
      ) : cardsLoading ? (
        <div className="credential-list" role="status" aria-label="正在加载卡片">
          {[0, 1, 2].map(row => <div key={row} className="credential-row session-skeleton" />)}
        </div>
      ) : cards.length ? (
        <div className="credential-list">
          {cards.map(card => {
            const active = activeCardId === card.id;
            const detail = active && status === "locating" ? "确认位置…" : active && status === "sending" ? "正在登录…" : active && status === "sent" ? "已登录" : `尾号 ${card.accessCode.slice(-4)}`;
            return <button key={card.id} className="credential-row" disabled={busy} data-active={active} onClick={() => void loginWithCard(card.id)}>
              <span className="min-w-0"><span className="credential-name">{card.label}</span><span className="credential-detail" aria-live={active ? "polite" : "off"}>{detail}</span></span>
              {active && status === "sent" ? <Check size={22} className="text-mint" /> : active && busy ? <Loader2 size={20} className="animate-spin text-mint" /> : <ChevronRight size={20} className="text-ink/30" />}
            </button>;
          })}
        </div>
      ) : (
        <div className="text-center">
          <p className="session-subtitle">还没有可用卡片，请先在 ArcadeLink 添加卡片</p>
          <button className="session-action mt-6 w-full" onClick={() => { setError(null); setReload(value => value + 1); }}>重新加载卡片</button>
        </div>
      ))}
    </section>
  );
}

function friendlyLoginError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === "geo_denied") return "需要定位权限才能确认你在店内";
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
      return "这台机台暂时不可用，请稍后重试";
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
