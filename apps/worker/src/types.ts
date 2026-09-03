export type Env = Cloudflare.Env & {
  APP_ORIGIN: string;
  SESSION_SECRET: string;
  URL_ENCRYPTION_KEY: string;
  MUNET_CLIENT_ID: string;
  MUNET_CLIENT_SECRET: string;
  TURNSTILE_SECRET_KEY?: string;
  EXTRA_ALLOWED_ORIGINS?: string;
};

export type Variables = {
  user: AuthUser | null;
  sessionId: string | null;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};

export type AuthUser = {
  id: string;
  email: string;
  role: "user" | "merchant" | "admin";
  bannedAt: string | null;
};

export type ShopRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  created_by: string;
};

export type MachineRow = {
  id: string;
  public_id: string;
  shop_id: string;
  name: string;
  hinata_url_encrypted: string;
  enabled: number;
  shop_name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
};
