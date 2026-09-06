import { useCallback, useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Activity, Link2, Lock, Plus, Save, Store, Terminal, Trash2, Users, X } from "lucide-react";
import { Api, type LoginEvent, type Machine, type Shop, type ShopMember } from "../api";
import { useAuth } from "./AuthContext";
import { MapPicker } from "./MapPicker";
import { RequireLogin } from "./RequireLogin";

export function MerchantPage() {
  const { user, refresh } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [members, setMembers] = useState<ShopMember[]>([]);
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showShopForm, setShowShopForm] = useState(false);
  const [deletingShop, setDeletingShop] = useState(false);

  const loadShops = useCallback(async () => {
    const result = await Api.shops();
    setShops(result.shops);
    setSelectedShopId((current) => current || result.shops[0]?.id || "");
  }, []);

  const loadShopDetails = useCallback(async (shopId: string) => {
    const [machineResult, memberResult, eventResult] = await Promise.all([
      Api.machines(shopId),
      Api.shopMembers(shopId),
      Api.loginEvents({ shopId, limit: 50 }),
    ]);
    setMachines(machineResult.machines);
    setMembers(memberResult.members);
    setEvents(eventResult.events);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadShops().catch((caught) => setError(caught instanceof Error ? caught.message : "无法加载店铺"));
  }, [loadShops, user]);

  useEffect(() => {
    if (!selectedShopId) {
      setMachines([]);
      setMembers([]);
      setEvents([]);
      return;
    }
    loadShopDetails(selectedShopId).catch((caught) => setError(caught instanceof Error ? caught.message : "无法加载店铺信息"));
  }, [loadShopDetails, selectedShopId]);

  const selectedShop = shops.find((shop) => shop.id === selectedShopId);
  const isOwnerOrAdmin = user?.role === "admin" || members.some((m) => m.userId === user?.id && m.role === "owner");

  const deleteSelectedShop = async () => {
    if (!selectedShop || deletingShop) return;
    if (!confirm(`确定要删除店铺「${selectedShop.name}」吗？\n此操作将同时删除该店铺下的所有机台与成员关联，且不可恢复。`)) return;
    setDeletingShop(true);
    setError(null);
    try {
      await Api.deleteShop(selectedShop.id);
      const remaining = shops.filter((s) => s.id !== selectedShop.id);
      setShops(remaining);
      setSelectedShopId(remaining[0]?.id || "");
      void refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除店铺失败");
    } finally {
      setDeletingShop(false);
    }
  };

  return (
    <RequireLogin>
      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="grid content-start gap-4">
          {shops.length > 0 && (
            <div className="rounded border border-ink/10 bg-panel p-4 shadow-soft">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Store size={18} />
                  店铺
                </h2>
                <button
                  type="button"
                  className="focus-ring flex items-center gap-1 rounded border border-ink/15 bg-surface px-2.5 py-1 text-xs font-medium hover:bg-ink/5"
                  onClick={() => setShowShopForm((prev) => !prev)}
                >
                  {showShopForm ? <X size={14} /> : <Plus size={14} />}
                  {showShopForm ? "收起开店" : "新建店铺"}
                </button>
              </div>
              <select className="focus-ring min-h-11 w-full rounded border border-ink/10 bg-surface px-3" value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)}>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(showShopForm || shops.length === 0) && (
            <ShopForm
              isCollapsible={shops.length > 0}
              onCancel={() => setShowShopForm(false)}
              onCreated={async (shop) => {
                await loadShops();
                setSelectedShopId(shop.id);
                setShowShopForm(false);
                void refresh();
              }}
            />
          )}

          {error && <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

          {selectedShop && (
            <>
              <MachineForm shopId={selectedShop.id} onCreated={() => loadShopDetails(selectedShop.id)} />
              <MembersPanel shopId={selectedShop.id} members={members} onChanged={() => loadShopDetails(selectedShop.id)} />
            </>
          )}
        </div>

        <div className="grid content-start gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">{selectedShop?.name || "店家管理"}</h1>
            {selectedShop && isOwnerOrAdmin && (
              <button
                type="button"
                disabled={deletingShop}
                className="focus-ring flex items-center gap-1.5 rounded border border-coral/30 px-3 py-1.5 text-xs font-medium text-coral hover:bg-coral/10 disabled:opacity-50"
                onClick={deleteSelectedShop}
                title="删除店铺"
              >
                <Trash2 size={14} />
                删除店铺
              </button>
            )}
          </div>
          {!selectedShop ? (
            <div className="rounded border border-dashed border-ink/20 bg-surface p-8 text-center text-ink/60">
              <Store size={32} className="mx-auto mb-2 text-ink/40" />
              <p className="font-medium text-ink">还没有店铺</p>
              <p className="mt-1 text-sm">
                {shops.length === 0 ? "请在左侧填写店铺信息并创建你的第一家店铺" : "请在左侧选择要管理的店铺"}
              </p>
            </div>
          ) : (
            <>
              {machines.length === 0 ? (
                <div className="rounded border border-dashed border-ink/20 bg-surface p-6 text-ink/60">暂无设备</div>
              ) : (
                machines.map((machine) => <MachineCard key={machine.id} machine={machine} onChanged={() => selectedShop && loadShopDetails(selectedShop.id)} />)
              )}
              <EventsPanel events={events} />
            </>
          )}
        </div>
      </section>
    </RequireLogin>
  );
}

function ShopForm({
  onCreated,
  isCollapsible,
  onCancel,
}: {
  onCreated: (shop: Shop) => void | Promise<void>;
  isCollapsible?: boolean;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radiusMeters, setRadiusMeters] = useState("80");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (latitude === null || longitude === null) {
      setError("请在地图上选择或填写店铺位置");
      return;
    }
    const radius = Number(radiusMeters);
    if (!Number.isFinite(radius) || radius < 30 || radius > 1000) {
      setError("允许打卡距离必须在 30 到 1000 米之间");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await Api.createShop({
        name,
        latitude,
        longitude,
        radiusMeters: radius,
      });
      setName("");
      setLatitude(null);
      setLongitude(null);
      setRadiusMeters("80");
      await onCreated(result.shop);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存店铺失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded border border-ink/10 bg-panel p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Store size={21} />
          {isCollapsible ? "新建店铺" : "添加店铺"}
        </h2>
        {isCollapsible && onCancel && (
          <button
            type="button"
            className="focus-ring rounded p-1 text-ink/60 hover:bg-ink/5"
            onClick={onCancel}
            title="收起"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {error && <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          店铺名称
          <input
            className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3 font-normal"
            placeholder="例如：万达广场机厅"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium">店铺位置</span>
          <MapPicker latitude={latitude} longitude={longitude} onChange={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-ink/70">
              纬度 (Latitude)
              <input
                className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3 font-mono text-sm text-ink font-normal"
                placeholder="点击地图或自动定位"
                value={latitude ?? ""}
                onChange={(event) => setLatitude(parseCoordinate(event.target.value))}
                required
              />
            </label>
            <label className="grid gap-1 text-xs text-ink/70">
              经度 (Longitude)
              <input
                className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3 font-mono text-sm text-ink font-normal"
                placeholder="点击地图或自动定位"
                value={longitude ?? ""}
                onChange={(event) => setLongitude(parseCoordinate(event.target.value))}
                required
              />
            </label>
          </div>
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          <div className="flex items-center justify-between">
            <span>允许打卡距离范围</span>
            <span className="text-xs font-normal text-ink/50">30 ~ 1000 米</span>
          </div>
          <div className="relative">
            <input
              type="number"
              min={30}
              max={1000}
              className="focus-ring min-h-11 w-full rounded border border-ink/10 bg-surface px-3 pr-10 font-normal"
              placeholder="默认 80"
              value={radiusMeters}
              onChange={(event) => setRadiusMeters(event.target.value)}
              inputMode="numeric"
              required
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink/50">
              米
            </span>
          </div>
          <span className="text-xs font-normal text-ink/50">
            玩家扫码/碰卡打卡时，允许距离店铺中心点的最大距离偏差（默认 80 米）
          </span>
        </label>
        <div className="flex gap-2">
          <button className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded bg-ink px-4 font-medium text-canvas disabled:opacity-60" disabled={busy}>
            <Plus size={18} />
            保存店铺
          </button>
          {isCollapsible && onCancel && (
            <button
              type="button"
              className="focus-ring rounded border border-ink/15 bg-surface px-4 font-medium text-ink hover:bg-ink/5"
              onClick={onCancel}
            >
              取消
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function parseCoordinate(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function MachineForm({ shopId, onCreated }: { shopId: string; onCreated: () => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [hinataUrl, setHinataUrl] = useState("");
  const [hinataPassword, setHinataPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await Api.createMachine({
        shopId,
        name,
        hinataUrl,
        enabled: true,
        ...(hinataPassword.trim() ? { hinataPassword: hinataPassword.trim() } : {}),
      });
      setName("");
      setHinataUrl("");
      setHinataPassword("");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加设备失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded border border-ink/10 bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Terminal size={18} />
        添加设备
      </h2>
      {error && <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      <div className="mt-4 grid gap-3">
        <input className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3" placeholder="设备名称" value={name} onChange={(event) => setName(event.target.value)} required />
        <input className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3" placeholder="机台连接地址（如 https://... 或 wss://...）" value={hinataUrl} onChange={(event) => setHinataUrl(event.target.value)} required />
        <input
          type="password"
          className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3"
          placeholder="加密密码（可选）"
          value={hinataPassword}
          onChange={(event) => setHinataPassword(event.target.value)}
          autoComplete="new-password"
        />
        <button className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded bg-mint px-4 font-medium text-white disabled:opacity-60" disabled={busy}>
          <Plus size={18} />
          生成登录入口
        </button>
      </div>
    </form>
  );
}

function MembersPanel({ shopId, members, onChanged }: { shopId: string; members: ShopMember[]; onChanged: () => void | Promise<void> }) {
  const [memberUser, setMemberUser] = useState("");
  const [role, setRole] = useState<ShopMember["role"]>("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await Api.addShopMember({ shopId, user: memberUser, role });
      setMemberUser("");
      setRole("staff");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加成员失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-ink/10 bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Users size={18} />
        店铺成员
      </h2>
      {error && <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <input className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3" placeholder="MuNET 用户名或 ID" value={memberUser} onChange={(event) => setMemberUser(event.target.value)} required />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select className="focus-ring min-h-11 rounded border border-ink/10 bg-surface px-3" value={role} onChange={(event) => setRole(event.target.value as ShopMember["role"])}>
            <option value="staff">店员</option>
            <option value="owner">负责人</option>
          </select>
          <button className="focus-ring rounded bg-ink px-4 font-medium text-canvas disabled:opacity-60" disabled={busy}>添加</button>
        </div>
      </form>
      <div className="mt-4 grid gap-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-3 rounded border border-ink/10 bg-surface p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{member.displayName}</p>
              <p className="text-sm text-ink/60">@{member.username} · {member.role === "owner" ? "负责人" : "店员"}</p>
            </div>
            <button
              title="移除成员"
              className="focus-ring grid size-9 shrink-0 place-items-center rounded text-coral hover:bg-coral/10"
              onClick={async () => {
                await Api.removeShopMember(member.id);
                await onChanged();
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function MachineCard({ machine, onChanged }: { machine: Machine; onChanged: () => void | Promise<void> }) {
  const url = `${window.location.origin}/t/${machine.publicId}`;
  const hasPassword = Boolean(machine.hasPassword);
  const [name, setName] = useState(machine.name);
  const [hinataUrl, setHinataUrl] = useState("");
  const [hinataPassword, setHinataPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [enabled, setEnabled] = useState(Number(machine.enabled) === 1 || machine.enabled === true);
  const [busy, setBusy] = useState(false);
  const isChanged =
    name !== machine.name ||
    enabled !== (Number(machine.enabled) === 1 || machine.enabled === true) ||
    hinataUrl.trim().length > 0 ||
    hinataPassword.trim().length > 0 ||
    clearPassword;

  useEffect(() => {
    setName(machine.name);
    setEnabled(Number(machine.enabled) === 1 || machine.enabled === true);
    setHinataUrl("");
    setHinataPassword("");
    setClearPassword(false);
  }, [machine]);

  return (
    <article className="grid gap-4 rounded border border-ink/10 bg-surface p-4 sm:grid-cols-[160px_1fr]">
      <div className="grid place-items-center rounded border border-ink/10 bg-white p-3">
        <QRCodeSVG value={url} size={132} />
      </div>
      <div className="min-w-0">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-2">
            <input className="focus-ring min-h-10 flex-1 rounded border border-ink/10 bg-panel px-3 font-semibold" value={name} onChange={(event) => setName(event.target.value)} />
            {hasPassword && !clearPassword && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-mint/10 px-2 py-1 text-xs font-medium text-mint" title="已配置加密密码">
                <Lock size={12} />
                E2EE
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 rounded border border-ink/10 bg-panel px-3 text-sm font-medium">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            可使用
          </label>
        </div>
        <input className="focus-ring mt-2 min-h-10 w-full rounded border border-ink/10 bg-panel px-3 text-sm" placeholder="连接地址（可选，如 https://... 或 wss://...）" value={hinataUrl} onChange={(event) => setHinataUrl(event.target.value)} />
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="password"
            className="focus-ring min-h-10 rounded border border-ink/10 bg-panel px-3 text-sm disabled:opacity-50"
            placeholder={
              clearPassword
                ? "将清除当前加密密码"
                : hasPassword
                  ? "已配置加密密码（留空保持不变）"
                  : "加密密码（可选）"
            }
            value={hinataPassword}
            onChange={(event) => {
              setHinataPassword(event.target.value);
              if (clearPassword) setClearPassword(false);
            }}
            disabled={clearPassword}
            autoComplete="new-password"
          />
          {hasPassword && (
            <button
              type="button"
              className={`focus-ring rounded border px-3 text-xs font-medium ${clearPassword
                ? "border-coral bg-coral/10 text-coral"
                : "border-ink/15 text-ink/70 hover:bg-panel"
                }`}
              onClick={() => {
                setClearPassword(!clearPassword);
                setHinataPassword("");
              }}
            >
              {clearPassword ? "取消清除" : "清除密码"}
            </button>
          )}
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-2 rounded border border-ink/10 bg-panel px-3 py-2">
          <Link2 size={16} className="shrink-0 text-mint" />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm">{url}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="focus-ring rounded border border-ink/20 px-3 py-2 text-sm font-medium hover:bg-panel" onClick={() => navigator.clipboard.writeText(url)}>
            复制登录地址
          </button>
          <button
            className="focus-ring flex items-center gap-2 rounded bg-mint px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={!isChanged || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const passwordUpdate = clearPassword
                  ? { hinataPassword: null }
                  : hinataPassword.trim()
                    ? { hinataPassword: hinataPassword.trim() }
                    : {};
                await Api.updateMachine(machine.id, {
                  name,
                  enabled,
                  ...(hinataUrl.trim() ? { hinataUrl } : {}),
                  ...passwordUpdate,
                });
                await onChanged();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Save size={16} />
            保存
          </button>
          <button
            className="focus-ring flex items-center gap-2 rounded border border-coral/30 px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10"
            onClick={async () => {
              if (!confirm("确定删除这台设备吗？")) return;
              await Api.deleteMachine(machine.id);
              await onChanged();
            }}
          >
            <Trash2 size={16} />
            删除
          </button>
        </div>
      </div>
    </article>
  );
}

function EventsPanel({ events }: { events: LoginEvent[] }) {
  return (
    <section className="rounded border border-ink/10 bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Activity size={18} />
        最近登录记录
      </h2>
      <div className="mt-4 grid gap-2">
        {events.length === 0 ? (
          <p className="rounded border border-dashed border-ink/20 bg-surface p-4 text-sm text-ink/60">暂无记录。</p>
        ) : (
          events.map((event) => (
            <article key={event.id} className="rounded border border-ink/10 bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{event.machineName || "设备"} · {event.result === "sent" ? "成功" : event.result === "blocked" ? "已拦截" : "失败"}</p>
                <time className="text-xs text-ink/50">{new Date(event.createdAt).toLocaleString()}</time>
              </div>
              <p className="mt-1 text-sm text-ink/60">
                {event.userName || "未知用户"} · {event.cardLabel || "卡片"}{typeof event.distanceMeters === "number" ? ` · 约 ${Math.round(event.distanceMeters)}m` : ""}
              </p>
              {event.errorMessage && <p className="mt-1 text-sm text-coral">{event.errorMessage}</p>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
