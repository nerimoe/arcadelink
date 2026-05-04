import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { z } from "zod";
import { attachUser, createSession, destroySession, firstUserRole, requireAdmin, requireMerchant, requireUser } from "./auth";
import { hashPassword, verifyPassword, encryptSecret, decryptSecret } from "./crypto";
import { canAccessShop, getMachineByPublicId, listShopsForUser } from "./db";
import { checkLocation, clampShopRadius } from "./geo";
import { allowedOrigins, assertAllowedOrigin, clientIp, jsonError } from "./http";
import { assertNotBanned, enforceRateLimits, loginRateLimitRules, verifyTurnstile } from "./risk";
import { sendHinataCard } from "./hinata";
import type { AppBindings, AuthUser } from "./types";
import {
  createCardSchema,
  createBanSchema,
  createMachineSchema,
  createShopSchema,
  loginSchema,
  machineLoginSchema,
  patchMachineSchema,
  patchShopSchema,
  setUserRoleSchema,
  shopMemberSchema,
  registerSchema,
  updateCardSchema,
} from "./validators";

const app = new Hono<AppBindings>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) return c.env.APP_ORIGIN || "https://link.neri.moe";
      return allowedOrigins(c.env).has(origin) ? origin : "";
    },
    allowHeaders: ["content-type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use("*", async (c, next) => {
  const rejected = (() => {
    try {
      assertAllowedOrigin(c.req.raw, c.env);
      return null;
    } catch (error) {
      return error instanceof Response ? error : null;
    }
  })();
  if (rejected) return rejected;
  await next();
});
app.use("*", attachUser);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json({
    user: user ? publicUser(user) : null,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
  });
});

app.post("/api/auth/register", async (c) => {
  const body = registerSchema.parse(await c.req.json());
  await verifyTurnstile(c, body.turnstileToken);
  const role = await firstUserRole(c.env.DB);
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  try {
    await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)")
      .bind(id, body.email, passwordHash, role)
      .run();
  } catch {
    jsonError(409, "这个邮箱已经注册过了");
  }
  await createSession(c, id);
  return c.json({ user: { id, email: body.email, role } }, 201);
});

app.post("/api/auth/login", async (c) => {
  const body = loginSchema.parse(await c.req.json());
  await verifyTurnstile(c, body.turnstileToken);
  const user = await c.env.DB.prepare("SELECT id, email, password_hash, role, banned_at FROM users WHERE email = ?")
    .bind(body.email)
    .first<{ id: string; email: string; password_hash: string; role: AuthUser["role"]; banned_at: string | null }>();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) jsonError(401, "邮箱或密码不正确");
  if (user.banned_at) jsonError(403, "这个账号暂时无法使用");
  await createSession(c, user.id);
  return c.json({ user: { id: user.id, email: user.email, role: user.role } });
});

app.post("/api/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

app.post("/api/admin/users/role", async (c) => {
  requireAdmin(c);
  const body = setUserRoleSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?")
    .bind(body.role, body.email)
    .run();
  if (result.meta.changes === 0) jsonError(404, "没有找到这个用户");
  return c.json({ ok: true });
});

app.get("/api/admin/users", async (c) => {
  requireAdmin(c);
  const query = c.req.query("query")?.trim().toLowerCase();
  const statement = query
    ? c.env.DB.prepare(
        "SELECT id, email, role, banned_at AS bannedAt, created_at AS createdAt FROM users WHERE lower(email) LIKE ? ORDER BY created_at DESC LIMIT 50",
      ).bind(`%${query}%`)
    : c.env.DB.prepare("SELECT id, email, role, banned_at AS bannedAt, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 50");
  const users = await statement.all();
  return c.json({ users: users.results });
});

app.get("/api/cards", async (c) => {
  const user = requireUser(c);
  const cards = await c.env.DB.prepare(
    "SELECT id, label, card_type AS cardType, access_code AS accessCode, source, disabled_at AS disabledAt, created_at AS createdAt FROM cards WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();
  return c.json({ cards: cards.results });
});

app.post("/api/cards", async (c) => {
  const user = requireUser(c);
  const body = createCardSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO cards (id, user_id, label, card_type, access_code, source) VALUES (?, ?, ?, 'aime', ?, 'manual')",
    )
      .bind(id, user.id, body.label, body.accessCode)
      .run();
  } catch {
    jsonError(409, "这张卡片已经添加过了");
  }
  return c.json({ card: { id, label: body.label, cardType: "aime", accessCode: body.accessCode, source: "manual" } }, 201);
});

app.patch("/api/cards/:id", async (c) => {
  const user = requireUser(c);
  const body = updateCardSchema.parse(await c.req.json());
  const card = await c.env.DB.prepare("SELECT id FROM cards WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).first();
  if (!card) jsonError(404, "没有找到这张卡片");
  await c.env.DB.prepare("UPDATE cards SET label = COALESCE(?, label), disabled_at = CASE WHEN ? THEN CURRENT_TIMESTAMP WHEN ? THEN NULL ELSE disabled_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(body.label ?? null, body.disabled === true, body.disabled === false, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.delete("/api/cards/:id", async (c) => {
  const user = requireUser(c);
  await c.env.DB.prepare("DELETE FROM cards WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

app.get("/api/machines/:publicId", async (c) => {
  const machine = await getMachineByPublicId(c.env.DB, c.req.param("publicId"));
  if (!machine || machine.enabled !== 1) jsonError(404, "没有找到这台机台");
  return c.json({
    machine: {
      publicId: machine.public_id,
      name: machine.name,
      shop: {
        name: machine.shop_name,
        radiusMeters: machine.radius_meters,
      },
    },
  });
});

app.post("/api/machines/:publicId/login", async (c) => {
  const user = requireUser(c);
  const body = machineLoginSchema.parse(await c.req.json());
  const ip = clientIp(c.req.raw);
  const machine = await getMachineByPublicId(c.env.DB, c.req.param("publicId"));
  if (!machine || machine.enabled !== 1) jsonError(404, "没有找到这台机台");

  const card = await c.env.DB.prepare(
    "SELECT id, access_code FROM cards WHERE id = ? AND user_id = ? AND disabled_at IS NULL",
  )
    .bind(body.cardId, user.id)
    .first<{ id: string; access_code: string }>();
  if (!card) jsonError(404, "没有找到这张卡片");

  await assertNotBanned(c, [
    ["user", user.id],
    ["ip", ip],
    ["card", card.id],
    ["machine", machine.id],
  ]);
  await enforceRateLimits(c, loginRateLimitRules(c, { userId: user.id, machineId: machine.id }));

  const location = checkLocation({
    userLat: body.lat,
    userLng: body.lng,
    accuracy: body.accuracy,
    shopLat: machine.latitude,
    shopLng: machine.longitude,
    radiusMeters: machine.radius_meters,
  });
  if (!location.allowed) {
    await recordLoginEvent(c, {
      userId: user.id,
      cardId: card.id,
      machineId: machine.id,
      ip,
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy,
      distanceMeters: Number.isFinite(location.distanceMeters) ? location.distanceMeters : null,
      riskResult: location.reason,
      result: "blocked",
      responseCode: null,
      errorMessage: location.reason,
    });
    jsonError(403, location.reason === "low_accuracy" ? "位置确认失败，请到店内再试" : "请到店内再登录");
  }

  const targetUrl = await decryptSecret(machine.hinata_url_encrypted, c.env.URL_ENCRYPTION_KEY);
  const result = await sendHinataCard(targetUrl, card.access_code);
  await recordLoginEvent(c, {
    userId: user.id,
    cardId: card.id,
    machineId: machine.id,
    ip,
    lat: body.lat,
    lng: body.lng,
    accuracy: body.accuracy,
    distanceMeters: location.distanceMeters,
    riskResult: "ok",
    result: result.ok ? "sent" : "failed",
    responseCode: result.status || null,
    errorMessage: result.error || null,
  });

  if (!result.ok) jsonError(502, result.error || "机台暂时没有响应");
  return c.json({ ok: true });
});

app.get("/api/merchant/shops", async (c) => {
  const user = requireMerchant(c);
  return c.json({ shops: await listShopsForUser(c, user) });
});

app.post("/api/merchant/shops", async (c) => {
  const user = requireMerchant(c);
  const body = createShopSchema.parse(await c.req.json());
  const shopId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO shops (id, name, latitude, longitude, radius_meters, created_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(shopId, body.name, body.latitude, body.longitude, clampShopRadius(body.radiusMeters), user.id),
    c.env.DB.prepare("INSERT INTO shop_members (id, shop_id, user_id, role) VALUES (?, ?, ?, 'owner')")
      .bind(crypto.randomUUID(), shopId, user.id),
  ]);
  return c.json({ shop: { id: shopId, ...body, radiusMeters: clampShopRadius(body.radiusMeters) } }, 201);
});

app.patch("/api/merchant/shops", async (c) => patchShop(c));
app.patch("/api/merchant/shops/:id", async (c) => patchShop(c, c.req.param("id")));

app.get("/api/merchant/shop-members", async (c) => {
  const user = requireMerchant(c);
  const shopId = c.req.query("shopId");
  if (!shopId) jsonError(400, "请选择店铺");
  if (!(await canAccessShop(c, user, shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const members = await c.env.DB.prepare(
    `SELECT shop_members.id, shop_members.role, shop_members.created_at AS createdAt, users.email, users.id AS userId
     FROM shop_members
     JOIN users ON users.id = shop_members.user_id
     WHERE shop_members.shop_id = ?
     ORDER BY shop_members.created_at ASC`,
  )
    .bind(shopId)
    .all();
  return c.json({ members: members.results });
});

app.post("/api/merchant/shop-members", async (c) => {
  const user = requireMerchant(c);
  const body = shopMemberSchema.parse(await c.req.json());
  if (!(await canAccessShop(c, user, body.shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE email = ?")
    .bind(body.email)
    .first<{ id: string; role: AuthUser["role"] }>();
  if (!target) jsonError(404, "没有找到这个用户");
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR REPLACE INTO shop_members (id, shop_id, user_id, role) VALUES (COALESCE((SELECT id FROM shop_members WHERE shop_id = ? AND user_id = ?), ?), ?, ?, ?)")
      .bind(body.shopId, target.id, crypto.randomUUID(), body.shopId, target.id, body.role),
    c.env.DB.prepare("UPDATE users SET role = CASE WHEN role = 'user' THEN 'merchant' ELSE role END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(target.id),
  ]);
  return c.json({ ok: true });
});

app.delete("/api/merchant/shop-members/:id", async (c) => {
  const user = requireMerchant(c);
  const member = await c.env.DB.prepare("SELECT id, shop_id, role FROM shop_members WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; shop_id: string; role: string }>();
  if (!member) jsonError(404, "没有找到这个成员");
  if (!(await canAccessShop(c, user, member.shop_id))) jsonError(403, "你没有这个店铺的管理权限");
  if (member.role === "owner") {
    const ownerCount = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM shop_members WHERE shop_id = ? AND role = 'owner'")
      .bind(member.shop_id)
      .first<{ count: number }>();
    if ((ownerCount?.count ?? 0) <= 1) jsonError(400, "至少需要保留一位店铺负责人");
  }
  await c.env.DB.prepare("DELETE FROM shop_members WHERE id = ?").bind(member.id).run();
  return c.json({ ok: true });
});

app.get("/api/merchant/machines", async (c) => {
  const user = requireMerchant(c);
  const shopId = c.req.query("shopId");
  if (!shopId) jsonError(400, "请选择店铺");
  if (!(await canAccessShop(c, user, shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const machines = await c.env.DB.prepare(
    "SELECT id, public_id AS publicId, shop_id AS shopId, name, enabled, created_at AS createdAt FROM machines WHERE shop_id = ? ORDER BY created_at DESC",
  )
    .bind(shopId)
    .all();
  return c.json({ machines: machines.results });
});

app.post("/api/merchant/machines", async (c) => {
  const user = requireMerchant(c);
  const body = createMachineSchema.parse(await c.req.json());
  if (!(await canAccessShop(c, user, body.shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const id = crypto.randomUUID();
  const publicId = randomPublicId();
  const encrypted = await encryptSecret(body.hinataUrl, c.env.URL_ENCRYPTION_KEY);
  await c.env.DB.prepare(
    "INSERT INTO machines (id, public_id, shop_id, name, hinata_url_encrypted, enabled) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, publicId, body.shopId, body.name, encrypted, body.enabled ? 1 : 0)
    .run();
  return c.json({ machine: { id, publicId, shopId: body.shopId, name: body.name, enabled: body.enabled } }, 201);
});

app.patch("/api/merchant/machines", async (c) => patchMachine(c));
app.patch("/api/merchant/machines/:id", async (c) => patchMachine(c, c.req.param("id")));

app.delete("/api/merchant/machines/:id", async (c) => {
  const user = requireMerchant(c);
  const machine = await c.env.DB.prepare("SELECT id, shop_id FROM machines WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; shop_id: string }>();
  if (!machine) jsonError(404, "没有找到这台设备");
  if (!(await canAccessShop(c, user, machine.shop_id))) jsonError(403, "你没有这个店铺的管理权限");
  await c.env.DB.prepare("DELETE FROM machines WHERE id = ?").bind(machine.id).run();
  return c.json({ ok: true });
});

app.get("/api/merchant/login-events", async (c) => {
  const user = requireMerchant(c);
  const shopId = c.req.query("shopId");
  const machineId = c.req.query("machineId");
  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);
  const rows = await listLoginEvents(c, user, {
    ...(shopId ? { shopId } : {}),
    ...(machineId ? { machineId } : {}),
    limit,
  });
  return c.json({ events: rows });
});

app.get("/api/admin/bans", async (c) => {
  requireAdmin(c);
  const bans = await c.env.DB.prepare("SELECT id, subject_type AS subjectType, subject_value AS subjectValue, reason, expires_at AS expiresAt, created_at AS createdAt FROM bans ORDER BY created_at DESC LIMIT 100").all();
  return c.json({ bans: bans.results });
});

app.post("/api/admin/bans", async (c) => {
  requireAdmin(c);
  const body = createBanSchema.parse(await c.req.json());
  await c.env.DB.prepare("INSERT OR REPLACE INTO bans (id, subject_type, subject_value, reason, expires_at) VALUES (COALESCE((SELECT id FROM bans WHERE subject_type = ? AND subject_value = ?), ?), ?, ?, ?, ?)")
    .bind(body.subjectType, body.subjectValue, crypto.randomUUID(), body.subjectType, body.subjectValue, body.reason, body.expiresAt ?? null)
    .run();
  return c.json({ ok: true }, 201);
});

app.delete("/api/admin/bans/:id", async (c) => {
  requireAdmin(c);
  await c.env.DB.prepare("DELETE FROM bans WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

app.onError((error, c) => {
  if (error instanceof z.ZodError) {
    return c.json({ error: "请检查填写内容", issues: error.flatten() }, 400);
  }
  console.error(error);
  return c.json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
});

async function patchShop(c: Context<AppBindings>, routeId?: string) {
  const user = requireMerchant(c);
  const body = patchShopSchema.parse(await c.req.json());
  const id = routeId || body.id;
  if (!id) jsonError(400, "请选择店铺");
  if (!(await canAccessShop(c, user, id))) jsonError(403, "你没有这个店铺的管理权限");
  await c.env.DB.prepare(
    "UPDATE shops SET name = COALESCE(?, name), latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), radius_meters = COALESCE(?, radius_meters), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  )
    .bind(body.name ?? null, body.latitude ?? null, body.longitude ?? null, body.radiusMeters ? clampShopRadius(body.radiusMeters) : null, id)
    .run();
  return c.json({ ok: true });
}

async function patchMachine(c: Context<AppBindings>, routeId?: string) {
  const user = requireMerchant(c);
  const body = patchMachineSchema.parse(await c.req.json());
  const id = routeId || body.id;
  if (!id) jsonError(400, "请选择设备");
  const machine = await c.env.DB.prepare("SELECT id, shop_id FROM machines WHERE id = ?")
    .bind(id)
    .first<{ id: string; shop_id: string }>();
  if (!machine) jsonError(404, "没有找到这台设备");
  if (!(await canAccessShop(c, user, machine.shop_id))) jsonError(403, "你没有这个店铺的管理权限");
  const encryptedUrl = body.hinataUrl ? await encryptSecret(body.hinataUrl, c.env.URL_ENCRYPTION_KEY) : null;
  await c.env.DB.prepare(
    "UPDATE machines SET name = COALESCE(?, name), hinata_url_encrypted = COALESCE(?, hinata_url_encrypted), enabled = COALESCE(?, enabled), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  )
    .bind(body.name ?? null, encryptedUrl, typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : null, id)
    .run();
  return c.json({ ok: true });
}

async function recordLoginEvent(
  c: Context<AppBindings>,
  event: {
    userId: string;
    cardId: string;
    machineId: string;
    ip: string;
    lat: number;
    lng: number;
    accuracy: number;
    distanceMeters: number | null;
    riskResult: string;
    result: string;
    responseCode: number | null;
    errorMessage: string | null;
  },
) {
  await c.env.DB.prepare(
    `INSERT INTO machine_login_events
     (id, user_id, card_id, machine_id, ip, latitude, longitude, accuracy, distance_meters, risk_result, result, response_code, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      event.userId,
      event.cardId,
      event.machineId,
      event.ip,
      event.lat,
      event.lng,
      event.accuracy,
      event.distanceMeters,
      event.riskResult,
      event.result,
      event.responseCode,
      event.errorMessage,
    )
    .run();
}

function publicUser(user: AuthUser) {
  return { id: user.id, email: user.email, role: user.role };
}

async function listLoginEvents(
  c: Context<AppBindings>,
  user: AuthUser,
  filters: { shopId?: string; machineId?: string; limit: number },
) {
  if (filters.shopId && !(await canAccessShop(c, user, filters.shopId))) jsonError(403, "你没有这个店铺的管理权限");
  if (filters.machineId) {
    const machine = await c.env.DB.prepare("SELECT shop_id FROM machines WHERE id = ?")
      .bind(filters.machineId)
      .first<{ shop_id: string }>();
    if (!machine) jsonError(404, "没有找到这台设备");
    if (!(await canAccessShop(c, user, machine.shop_id))) jsonError(403, "你没有这个店铺的管理权限");
  }

  const bindings: Array<string | number> = [];
  const where: string[] = [];
  if (user.role !== "admin") {
    where.push("shop_members.user_id = ?");
    bindings.push(user.id);
  }
  if (filters.shopId) {
    where.push("shops.id = ?");
    bindings.push(filters.shopId);
  }
  if (filters.machineId) {
    where.push("machines.id = ?");
    bindings.push(filters.machineId);
  }
  bindings.push(filters.limit);
  const sql = `
    SELECT machine_login_events.id,
           machine_login_events.created_at AS createdAt,
           machine_login_events.result,
           machine_login_events.risk_result AS riskResult,
           machine_login_events.response_code AS responseCode,
           machine_login_events.error_message AS errorMessage,
           machine_login_events.distance_meters AS distanceMeters,
           machines.name AS machineName,
           shops.name AS shopName,
           users.email AS userEmail,
           cards.label AS cardLabel
    FROM machine_login_events
    LEFT JOIN machines ON machines.id = machine_login_events.machine_id
    LEFT JOIN shops ON shops.id = machines.shop_id
    LEFT JOIN shop_members ON shop_members.shop_id = shops.id
    LEFT JOIN users ON users.id = machine_login_events.user_id
    LEFT JOIN cards ON cards.id = machine_login_events.card_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY machine_login_events.id
    ORDER BY machine_login_events.created_at DESC
    LIMIT ?`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all()).results;
}

function randomPublicId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export default app;
