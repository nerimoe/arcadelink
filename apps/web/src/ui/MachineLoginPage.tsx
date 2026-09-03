import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Gamepad2, LocateFixed, ShieldAlert } from "lucide-react";
import { Api, type Card, type PublicMachine } from "../api";
import { useAuth } from "./AuthContext";

export function MachineLoginPage() {
  const { publicId = "" } = useParams();
  const { user, loading } = useAuth();
  const [machine, setMachine] = useState<PublicMachine | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCard, setSelectedCard] = useState("");
  const [status, setStatus] = useState<"idle" | "locating" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Api.publicMachine(publicId)
      .then((result) => setMachine(result.machine))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "没有找到这台机台"));
  }, [publicId]);

  useEffect(() => {
    if (!user) return;
    Api.cards().then((result) => {
      const activeCards = result.cards.filter((card) => !card.disabledAt);
      setCards(activeCards);
      setSelectedCard(activeCards[0]?.id ?? "");
    });
  }, [user]);

  const title = machine ? `${machine.shop.name} / ${machine.name}` : "ArcadeLink";

  const login = async () => {
    if (!selectedCard) return;
    setError(null);
    setStatus("locating");
    try {
      const position = await getPosition();
      setStatus("sending");
      await Api.loginMachine(publicId, {
        cardId: selectedCard,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后再试");
    }
  };

  if (loading) return <Panel>加载中...</Panel>;
  if (error && !machine) return <Panel>{error}</Panel>;

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
            <Link className="focus-ring rounded bg-ink px-5 py-4 text-center font-semibold text-white" to={`/login?next=${encodeURIComponent(`/m/${publicId}`)}`}>
              登录后选择卡片
            </Link>
            <Link className="focus-ring rounded border border-ink/20 px-5 py-4 text-center font-semibold hover:bg-white" to={`/register?next=${encodeURIComponent(`/m/${publicId}`)}`}>
              创建账号
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              选择卡片
              <select className="focus-ring min-h-12 rounded border border-black/10 bg-white px-3" value={selectedCard} onChange={(event) => setSelectedCard(event.target.value)}>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.label} · {card.accessCode.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
            {cards.length === 0 && (
              <Link className="rounded border border-dashed border-black/20 bg-white p-4 text-center text-mint" to="/cards">
                先添加一张卡片
              </Link>
            )}
            {error && (
              <p className="flex items-center gap-2 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
                <ShieldAlert size={16} />
                {error}
              </p>
            )}
            {status === "sent" ? (
              <div className="flex min-h-14 items-center justify-center gap-2 rounded bg-mint px-5 font-semibold text-white">
                <CheckCircle2 size={20} />
                已为你登录
              </div>
            ) : (
              <button
                className="focus-ring flex min-h-16 items-center justify-center gap-3 rounded bg-ink px-5 text-lg font-semibold text-white disabled:opacity-60"
                disabled={!selectedCard || status !== "idle"}
                onClick={login}
              >
                <LocateFixed size={22} />
                {status === "locating" ? "正在确认位置..." : status === "sending" ? "正在登录..." : "登录机台"}
              </button>
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
