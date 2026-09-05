import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Api, type Card } from "../api";
import { useAuth } from "./AuthContext";
import { RequireLogin } from "./RequireLogin";

export function CardsPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [label, setLabel] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const result = await Api.cards();
    setCards(result.cards);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await Api.createCard(label, accessCode);
      setLabel("");
      setAccessCode("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加失败");
    }
  };

  return (
    <RequireLogin>
      <section className="grid gap-6 md:grid-cols-[360px_1fr]">
        <form onSubmit={create} className="rounded border border-black/10 bg-panel p-5 shadow-soft">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CreditCard size={22} />
            我的卡片
          </h1>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              显示名称
              <input className="focus-ring min-h-11 rounded border border-black/10 bg-white px-3" value={label} onChange={(event) => setLabel(event.target.value)} required />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              卡片号码
              <input
                className="focus-ring min-h-11 rounded border border-black/10 bg-white px-3 font-mono"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 20))}
                inputMode="numeric"
                pattern="\d{20}"
                required
              />
            </label>
            {error && <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
            <button className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded bg-ink px-4 font-medium text-white">
              <Plus size={18} />
              添加卡片
            </button>
            <a
              className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded border border-black/15 bg-white px-4 font-medium"
              href="/api/auth/munet?next=/cards"
            >
              <RefreshCw size={18} />
              与 MuNET 同步
            </a>
          </div>
        </form>
        <div className="grid content-start gap-3">
          {cards.length === 0 ? (
            <div className="rounded border border-dashed border-black/20 bg-white p-6 text-ink/60">还没有添加卡片。</div>
          ) : (
            cards.map((card) => (
              <div key={card.id} className="flex items-center justify-between gap-4 rounded border border-black/10 bg-white p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{card.label}</p>
                  <p className="mt-1 break-all font-mono text-sm text-ink/60">{card.accessCode}</p>
                </div>
                <button
                  title="删除卡片"
                  className="focus-ring grid size-10 shrink-0 place-items-center rounded text-coral hover:bg-coral/10"
                  onClick={async () => {
                    await Api.deleteCard(card.id);
                    await load();
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </RequireLogin>
  );
}
