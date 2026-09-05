import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "merchant" | "admin";
};

export type Card = {
  id: string;
  label: string;
  cardType: string;
  accessCode: string;
  source: string;
  disabledAt?: string | null;
};

export type PublicMachine = {
  publicId: string;
  name: string;
  shop: {
    name: string;
    radiusMeters: number;
  };
};

export type Shop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  radiusMeters?: number;
};

export type Machine = {
  id: string;
  publicId: string;
  shopId: string;
  name: string;
  enabled: boolean | number;
};

export type UserSummary = {
  id: string;
  username: string;
  displayName: string;
  role: User["role"];
  bannedAt?: string | null;
  createdAt: string;
};

export type ShopMember = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: "owner" | "staff";
  createdAt: string;
};

export type LoginEvent = {
  id: string;
  createdAt: string;
  result: string;
  riskResult: string;
  responseCode?: number | null;
  errorMessage?: string | null;
  distanceMeters?: number | null;
  machineName?: string | null;
  shopName?: string | null;
  userName?: string | null;
  cardLabel?: string | null;
};

export type Ban = {
  id: string;
  subjectType: "user" | "ip" | "card" | "machine";
  subjectValue: string;
  reason: string;
  expiresAt?: string | null;
  createdAt: string;
};

export type AuthIdentity = {
  id: string;
  provider: string;
  username?: string | null;
  displayName?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
};

export type Passkey = {
  id: string;
  name: string;
  providerName?: string | null;
  deviceType: string;
  backedUp: number;
  createdAt: string;
  lastUsedAt?: string | null;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export const Api = {
  me: () => api<{ user: User | null }>("/api/me"),
  passkeyOptions: () => api<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/options"),
  loginWithPasskey: (response: AuthenticationResponseJSON) =>
    api<{ ok: true }>("/api/auth/passkey", { method: "POST", body: JSON.stringify(response) }),
  passkeyRegistrationOptions: () =>
    api<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkey/register/options"),
  registerPasskey: (credential: RegistrationResponseJSON, name?: string) =>
    api<{ ok: true }>("/api/auth/passkey/register", {
      method: "POST",
      body: JSON.stringify({ credential, name }),
    }),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  account: () => api<{ identities: AuthIdentity[]; passkeys: Passkey[] }>("/api/account"),
  deletePasskey: (id: string) => api<{ ok: true }>(`/api/account/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  renamePasskey: (id: string, name: string) =>
    api<{ ok: true }>(`/api/account/passkeys/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  cards: () => api<{ cards: Card[]; authorizationRequired: boolean; syncError: string | null }>("/api/cards"),
  syncCards: () =>
    api<{ cards: Card[]; authorizationRequired: boolean; syncError: string | null }>("/api/cards/sync", {
      method: "POST",
    }),
  createCard: (label: string, accessCode: string) =>
    api<{ card: Card }>("/api/cards", { method: "POST", body: JSON.stringify({ label, accessCode }) }),
  deleteCard: (id: string) => api<{ ok: true }>(`/api/cards/${id}`, { method: "DELETE" }),
  publicMachine: (publicId: string) => api<{ machine: PublicMachine }>(`/api/machines/${publicId}`),
  loginMachine: (publicId: string, input: { cardId: string; lat: number; lng: number; accuracy: number }) =>
    api<{ ok: true }>(`/api/machines/${publicId}/login`, { method: "POST", body: JSON.stringify(input) }),
  shops: () => api<{ shops: Shop[] }>("/api/merchant/shops"),
  createShop: (input: { name: string; latitude: number; longitude: number; radiusMeters: number }) =>
    api<{ shop: Shop }>("/api/merchant/shops", { method: "POST", body: JSON.stringify(input) }),
  machines: (shopId: string) => api<{ machines: Machine[] }>(`/api/merchant/machines?shopId=${encodeURIComponent(shopId)}`),
  createMachine: (input: { shopId: string; name: string; hinataUrl: string; enabled: boolean }) =>
    api<{ machine: Machine }>("/api/merchant/machines", { method: "POST", body: JSON.stringify(input) }),
  updateMachine: (id: string, input: { name?: string; hinataUrl?: string; enabled?: boolean }) =>
    api<{ ok: true }>(`/api/merchant/machines/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteMachine: (id: string) => api<{ ok: true }>(`/api/merchant/machines/${id}`, { method: "DELETE" }),
  shopMembers: (shopId: string) => api<{ members: ShopMember[] }>(`/api/merchant/shop-members?shopId=${encodeURIComponent(shopId)}`),
  addShopMember: (input: { shopId: string; user: string; role: "owner" | "staff" }) =>
    api<{ ok: true }>("/api/merchant/shop-members", { method: "POST", body: JSON.stringify(input) }),
  removeShopMember: (id: string) => api<{ ok: true }>(`/api/merchant/shop-members/${id}`, { method: "DELETE" }),
  loginEvents: (input: { shopId?: string; machineId?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (input.shopId) params.set("shopId", input.shopId);
    if (input.machineId) params.set("machineId", input.machineId);
    if (input.limit) params.set("limit", String(input.limit));
    return api<{ events: LoginEvent[] }>(`/api/merchant/login-events?${params.toString()}`);
  },
  adminUsers: (query?: string) => api<{ users: UserSummary[] }>(`/api/admin/users${query ? `?query=${encodeURIComponent(query)}` : ""}`),
  setUserRole: (userId: string, role: User["role"]) =>
    api<{ ok: true }>("/api/admin/users/role", { method: "POST", body: JSON.stringify({ userId, role }) }),
  bans: () => api<{ bans: Ban[] }>("/api/admin/bans"),
  createBan: (input: { subjectType: Ban["subjectType"]; subjectValue: string; reason: string; expiresAt?: string }) =>
    api<{ ok: true }>("/api/admin/bans", { method: "POST", body: JSON.stringify(input) }),
  deleteBan: (id: string) => api<{ ok: true }>(`/api/admin/bans/${id}`, { method: "DELETE" }),
};
