import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { z } from "zod";
import { attachUser, createSession, destroySession, requireAdmin, requireUser } from "./auth";
import { encryptSecret, decryptSecret, randomToken, sha256 } from "./crypto";
import { canAccessShop, getMachineByPublicId, listShopsForUser } from "./db";
import { checkLocation, clampShopRadius } from "./geo";
import { allowedOrigins, assertAllowedOrigin, clientIp, jsonError } from "./http";
import { assertNotBanned, enforceRateLimits, loginRateLimitRules } from "./risk";
import { sendHinataCard } from "./hinata";
import { androidAssetLinksResponse, appleAppSiteAssociationResponse } from "./apple";
import { createMachineSession, publicMachine, resolveMachineSession } from "./machine-session";
import { finishMunetAuth, munetAuthorizeUrl } from "./munet";
import {
  appClipAuthCallbackURLWithParams,
  consumeAppClipAuthCode,
  consumeAppClipAuthState,
  createAppClipAuthCode,
  createAppClipAuthState,
  provisionMunetUser,
} from "./munet-appclip";
import { syncMunetCards } from "./oauth";
import { authenticationOptions, finishAuthentication, finishRegistration, registrationOptions } from "./passkeys";
import type { AppBindings, AuthUser } from "./types";
import {
  createCardSchema,
  createBanSchema,
  createMachineSchema,
  createShopSchema,
  appClipAuthExchangeSchema,
  patchShopSchema,
  machineLoginSchema,
  machineSessionStartSchema,
  passkeyLabelSchema,
  passkeyNameSchema,
  patchMachineSchema,
  setUserRoleSchema,
  shopMemberSchema,
} from "./validators";

const app = new Hono<AppBindings>();
const oauthStateCookie = "arcadelink_munet_state";
const oauthNextCookie = "arcadelink_munet_next";

function shopHeroPath(publicId: string, hash: string): string {
  return `/api/shops/${encodeURIComponent(publicId)}/hero?v=${hash}`;
}

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) return c.env.APP_ORIGIN;
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

app.get("/api/shops/:publicId/hero", async (c) => {
  const row = await c.env.DB.prepare("SELECT hero_data AS heroData, COALESCE(hero_hash, 'original') AS version FROM shops WHERE public_id = ?")
    .bind(c.req.param("publicId"))
    .first<{ heroData: string | null; version: string }>();
  const version = c.req.query("v");
  // Never serve new bytes at an old immutable URL. Only the current cover is stored.
  const missing = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  if (!row || (version !== undefined && version !== row.version)) return missing();
  const match = row?.heroData?.match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return missing();

  const mimeType = match[1];
  const encoded = match[2];
  if (!mimeType || !encoded) return missing();

  const headers = {
    "cache-control": version ? "public, max-age=31536000, immutable" : "public, max-age=60, must-revalidate",
    "content-type": mimeType,
    etag: `"${row.version}"`,
  };
  const validators = c.req.header("if-none-match")?.split(",").map((value) => value.trim().replace(/^W\//, ""));
  if (validators?.some((value) => value === "*" || value === headers.etag)) {
    return new Response(null, { status: 304, headers });
  }

  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Response(bytes, { headers });
});

app.get("/.well-known/apple-app-site-association", (c) => {
  return appleAppSiteAssociationResponse(c.env.APPLE_TEAM_ID);
});

app.get("/.well-known/assetlinks.json", (c) => {
  return androidAssetLinksResponse(c.env.ANDROID_CERT_FINGERPRINTS);
});

app.get("/api/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  const hasShops =
    user.role === "admin" ||
    Boolean(
      await c.env.DB.prepare("SELECT 1 FROM shop_members WHERE user_id = ? LIMIT 1")
        .bind(user.id)
        .first(),
    );
  return c.json({ user: { ...publicUser(user), hasShops } });
});

app.post("/api/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

app.get("/api/auth/passkey/options", async (c) => {
  const minute = Math.floor(Date.now() / 60_000);
  await enforceRateLimits(c, [
    { key: `passkey:options:${clientIp(c.req.raw)}:${minute}`, limit: 10, windowSeconds: 90 },
  ]);
  return c.json(await authenticationOptions(c));
});

app.post("/api/auth/passkey", async (c) => {
  const userId = await finishAuthentication(c, await c.req.json());
  const user = await c.env.DB.prepare("SELECT banned_at FROM users WHERE id = ?")
    .bind(userId)
    .first<{ banned_at: string | null }>();
  if (!user || user.banned_at) jsonError(403, "这个账号暂时无法使用");
  await createSession(c, userId);
  return c.json({ ok: true });
});

app.get("/api/auth/passkey/register/options", async (c) => {
  const user = requireUser(c);
  return c.json(await registrationOptions(c, user));
});

app.post("/api/auth/passkey/register", async (c) => {
  const user = requireUser(c);
  const body = await c.req.json<{ credential: RegistrationResponseJSON; name?: unknown }>();
  const name = body.name === undefined ? undefined : passkeyLabelSchema.parse(body.name);
  await finishRegistration(c, user, body.credential, name);
  return c.json({ ok: true }, 201);
});

app.get("/api/account", async (c) => {
  const user = requireUser(c);
  const [identities, passkeys] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, provider, username, display_name AS displayName, created_at AS createdAt,
              last_login_at AS lastLoginAt
       FROM auth_identities WHERE user_id = ? ORDER BY created_at ASC`,
    ).bind(user.id).all(),
    c.env.DB.prepare(
      `SELECT id, name, device_type AS deviceType, backed_up AS backedUp,
              provider_name AS providerName, created_at AS createdAt, last_used_at AS lastUsedAt
       FROM passkeys WHERE user_id = ? ORDER BY created_at DESC`,
    ).bind(user.id).all(),
  ]);
  return c.json({ identities: identities.results, passkeys: passkeys.results });
});

app.delete("/api/account/passkeys/:id", async (c) => {
  const user = requireUser(c);
  await c.env.DB.prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .run();
  return c.json({ ok: true });
});

app.patch("/api/account/passkeys/:id", async (c) => {
  const user = requireUser(c);
  const body = passkeyNameSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare(
    "UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?",
  ).bind(body.name, c.req.param("id"), user.id).run();
  if (result.meta.changes === 0) jsonError(404, "没有找到这个 Passkey");
  return c.json({ ok: true });
});

app.get("/api/auth/munet", (c) => {
  if (!c.env.MUNET_CLIENT_ID || !c.env.MUNET_CLIENT_SECRET) jsonError(503, "MuNET 登录尚未配置");
  const state = randomToken(24);
  const cookieOptions = {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 600,
  };
  setCookie(c, oauthStateCookie, state, cookieOptions);
  setCookie(c, oauthNextCookie, safePath(c.req.query("next")), cookieOptions);
  return c.redirect(munetAuthorizeUrl(c.env.MUNET_CLIENT_ID, `${c.env.APP_ORIGIN}/callback`, state));
});

app.get("/api/appclip/auth/start", async (c) => {
  if (!c.env.MUNET_CLIENT_ID || !c.env.MUNET_CLIENT_SECRET) jsonError(503, "MuNET 登录尚未配置");
  const minute = Math.floor(Date.now() / 60_000);
  await enforceRateLimits(c, [
    {
      key: `appclip-auth:start:${clientIp(c.req.raw)}:${minute}`,
      limit: 5,
      windowSeconds: 90,
    },
  ]);
  const state = `appclip.${randomToken(24)}`;
  await createAppClipAuthState(c, state);
  return c.redirect(
    munetAuthorizeUrl(
      c.env.MUNET_CLIENT_ID,
      `${c.env.APP_ORIGIN}/callback`,
      state,
    ),
  );
});

// Keep the legacy callback for authorizations already in flight.
app.get("/api/appclip/auth/callback", (c) => finishAppClipCallback(c, "/api/appclip/auth/callback"));

async function finishAppClipCallback(c: Context<AppBindings>, redirectPath: string) {
  const callback = (params: Record<string, string>) =>
    c.redirect(appClipAuthCallbackURLWithParams(params));
  const state = c.req.query("state");
  const stateValid = state ? await consumeAppClipAuthState(c, state) : false;
  if (!stateValid) return callback({ error: "MuNET 授权无效，请重新登录" });
  if (c.req.query("error")) return callback({ error: "MuNET 授权已取消" });
  const code = c.req.query("code");
  if (!code) return callback({ error: "MuNET 授权无效，请重新登录" });

  try {
    const munet = await finishMunetAuth({
      clientId: c.env.MUNET_CLIENT_ID,
      clientSecret: c.env.MUNET_CLIENT_SECRET,
      code,
      redirectUri: `${c.env.APP_ORIGIN}${redirectPath}`,
    });
    const { userId } = await provisionMunetUser(c, munet);
    const exchangeCode = await createAppClipAuthCode(c, userId);
    return callback({ code: exchangeCode });
  } catch (error) {
    console.error(error);
    return callback({
      error:
        error instanceof z.ZodError
          ? "MuNET 返回的数据无法识别"
          : error instanceof Error
            ? error.message
            : "MuNET 登录失败",
    });
  }
}

app.post("/api/appclip/auth/exchange", async (c) => {
  const minute = Math.floor(Date.now() / 60_000);
  await enforceRateLimits(c, [
    {
      key: `appclip-auth:exchange:${clientIp(c.req.raw)}:${minute}`,
      limit: 10,
      windowSeconds: 90,
    },
  ]);
  const body = appClipAuthExchangeSchema.parse(await c.req.json());
  const userId = await consumeAppClipAuthCode(c, body.code);
  await createSession(c, userId);
  return c.json({ ok: true });
});

app.get("/callback", async (c) => {
  // The prefix only selects the flow; the native handler must atomically
  // consume a live server-issued state before exchanging any OAuth code.
  if (c.req.query("state")?.startsWith("appclip.")) {
    return finishAppClipCallback(c, "/callback");
  }
  const next = safePath(getCookie(c, oauthNextCookie));
  const fail = (message: string) => c.redirect(`/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);
  const expectedState = getCookie(c, oauthStateCookie);
  deleteCookie(c, oauthStateCookie, { path: "/" });
  deleteCookie(c, oauthNextCookie, { path: "/" });
  if (c.req.query("error")) return fail("MuNET 授权已取消");
  const code = c.req.query("code");
  if (!code || !expectedState || c.req.query("state") !== expectedState) return fail("MuNET 授权无效，请重试");

  try {
    const munet = await finishMunetAuth({
      clientId: c.env.MUNET_CLIENT_ID,
      clientSecret: c.env.MUNET_CLIENT_SECRET,
      code,
      redirectUri: `${c.env.APP_ORIGIN}/callback`,
    });
    const { userId, isNewUser } = await provisionMunetUser(c, munet);
    await createSession(c, userId);
    return c.redirect(isNewUser ? `/settings?setup=passkey&next=${encodeURIComponent(next)}` : next);
  } catch (error) {
    console.error(error);
    return fail(error instanceof z.ZodError ? "MuNET 返回的数据无法识别" : error instanceof Error ? error.message : "MuNET 登录失败");
  }
});

app.post("/api/admin/users/role", async (c) => {
  requireAdmin(c);
  const body = setUserRoleSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(body.role, body.userId)
    .run();
  if (result.meta.changes === 0) jsonError(404, "没有找到这个用户");
  return c.json({ ok: true });
});

app.get("/api/admin/users", async (c) => {
  requireAdmin(c);
  const query = c.req.query("query")?.trim().toLowerCase();
  const statement = query
    ? c.env.DB.prepare(
        `SELECT users.id, identities.username, identities.display_name AS displayName, users.role,
                users.banned_at AS bannedAt, users.created_at AS createdAt
         FROM users JOIN auth_identities AS identities
           ON identities.user_id = users.id AND identities.provider = 'munet'
         WHERE lower(identities.username) LIKE ? OR lower(identities.display_name) LIKE ? OR users.id LIKE ?
         ORDER BY users.created_at DESC LIMIT 50`,
      ).bind(`%${query}%`, `%${query}%`, `%${query}%`)
    : c.env.DB.prepare(
        `SELECT users.id, identities.username, identities.display_name AS displayName, users.role,
                users.banned_at AS bannedAt, users.created_at AS createdAt
         FROM users JOIN auth_identities AS identities
           ON identities.user_id = users.id AND identities.provider = 'munet'
         ORDER BY users.created_at DESC LIMIT 50`,
      );
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
  return c.json({ cards: cards.results, authorizationRequired: false, syncError: null });
});

app.post("/api/cards/sync", async (c) => {
  const user = requireUser(c);
  let authorizationRequired = false;
  let syncError: string | null = null;
  try {
    const sync = await syncMunetCards(c, user.id);
    authorizationRequired = sync.authorizationRequired;
  } catch (error) {
    console.error(error);
    syncError = "MuNET 暂时无法同步，显示上次结果";
  }
  const cards = await c.env.DB.prepare(
    "SELECT id, label, card_type AS cardType, access_code AS accessCode, source, disabled_at AS disabledAt, created_at AS createdAt FROM cards WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();
  return c.json({ cards: cards.results, authorizationRequired, syncError });
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

app.delete("/api/cards/:id", async (c) => {
  const user = requireUser(c);
  await c.env.DB.prepare("DELETE FROM cards WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

app.get("/t/:shopCode/:publicId", async (c) => {
  try {
    const session = await createMachineSession(c, c.req.param("shopCode"), c.req.param("publicId"));
    return c.redirect(`/m?ticket=${encodeURIComponent(session.ticket)}`, 302);
  } catch (error) {
    if (error instanceof HTTPException && error.status === 404) {
      return c.redirect(`/m/error?error=${encodeURIComponent("机台不可用")}`, 302);
    }
    throw error;
  }
});

app.post("/api/machines/session/start", async (c) => {
  const minute = Math.floor(Date.now() / 60_000);
  await enforceRateLimits(c, [
    {
      key: `machine-session:start:${clientIp(c.req.raw)}:${minute}`,
      limit: 60,
      windowSeconds: 90,
    },
  ]);
  const body = machineSessionStartSchema.parse(await c.req.json());
  const session = await createMachineSession(c, body.shopCode, body.publicId);
  return c.json({
    ticket: session.ticket,
    expiresIn: session.expiresIn,
    machine: publicMachine(session.machine),
  });
});

async function handleMachineSession(c: Context<AppBindings>, routePublicId?: string) {
  const ticket = c.req.query("ticket") || routePublicId || "";
  const session = await resolveMachineSession(c, ticket, routePublicId);
  return c.json({ machine: publicMachine(session.machine) });
}

app.get("/api/machines/session", async (c) => handleMachineSession(c));
app.get("/api/machines/:publicId", async (c) => handleMachineSession(c, c.req.param("publicId")));

async function handleMachineLogin(c: Context<AppBindings>, routePublicId?: string) {
  const user = requireUser(c);
  const body = machineLoginSchema.parse(await c.req.json());

  const { publicId, machine } = await resolveMachineSession(c, body.ticket, routePublicId);

  const ip = clientIp(c.req.raw);

  const card = await c.env.DB.prepare(
    "SELECT id, access_code FROM cards WHERE id = ? AND user_id = ? AND disabled_at IS NULL",
  )
    .bind(body.cardId, user.id)
    .first<{ id: string; access_code: string }>();
  if (!card) jsonError(404, "卡片不可用或已失效");

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
    jsonError(403, "请到店再进行登录");
  }

  const targetUrl = await decryptSecret(machine.hinata_url_encrypted, c.env.URL_ENCRYPTION_KEY);
  const password = machine.hinata_password_encrypted
    ? await decryptSecret(machine.hinata_password_encrypted, c.env.URL_ENCRYPTION_KEY)
    : null;
  const result = await sendHinataCard(targetUrl, card.access_code, password);
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

  if (result.ok) {
    await c.env.RATE_LIMIT.delete(`ticket:${body.ticket}`);
    await c.env.RATE_LIMIT.delete(`ticket:${publicId}:${body.ticket}`);
  }

  if (!result.ok) jsonError(502, "机台暂时不可用");
  return c.json({ ok: true });
}

app.post("/api/machines/login", async (c) => handleMachineLogin(c));
app.post("/api/machines/:publicId/login", async (c) => handleMachineLogin(c, c.req.param("publicId")));

app.get("/api/merchant/shops", async (c) => {
  const user = requireUser(c);
  return c.json({ shops: await listShopsForUser(c, user) });
});

app.post("/api/merchant/shops", async (c) => {
  const user = requireUser(c);
  const body = createShopSchema.parse(await c.req.json());
  const shopId = crypto.randomUUID();
  const publicId = randomToken(8);
  const heroHash = body.heroData ? await sha256(body.heroData) : null;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO shops (id, public_id, name, hero_data, hero_hash, latitude, longitude, radius_meters, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(shopId, publicId, body.name, body.heroData ?? null, heroHash, body.latitude, body.longitude, clampShopRadius(body.radiusMeters), user.id),
    c.env.DB.prepare("INSERT INTO shop_members (id, shop_id, user_id, role) VALUES (?, ?, ?, 'owner')")
      .bind(crypto.randomUUID(), shopId, user.id),
  ]);
  const { heroData, ...shop } = body;
  return c.json({ shop: { id: shopId, publicId, ...shop, heroUrl: heroHash ? shopHeroPath(publicId, heroHash) : null } }, 201);
});

app.patch("/api/merchant/shops/:id", async (c) => {
  const user = requireUser(c);
  const shopId = c.req.param("id");
  if (!(await canAccessShop(c, user, shopId))) jsonError(403, "你没有这个店铺的管理权限");
  if (user.role !== "admin") {
    const member = await c.env.DB.prepare(
      "SELECT role FROM shop_members WHERE shop_id = ? AND user_id = ?",
    )
      .bind(shopId, user.id)
      .first<{ role: string }>();
    if (!member || member.role !== "owner") {
      jsonError(403, "只有店铺负责人或管理员才能修改店铺信息");
    }
  }

  const body = patchShopSchema.parse(await c.req.json());
  const radius = body.radiusMeters !== undefined ? clampShopRadius(body.radiusMeters) : null;
  await c.env.DB.prepare(
    `UPDATE shops
     SET name = COALESCE(?, name),
         hero_data = CASE WHEN ? THEN ? ELSE hero_data END,
         hero_hash = CASE WHEN ? THEN ? ELSE hero_hash END,
         latitude = COALESCE(?, latitude),
         longitude = COALESCE(?, longitude),
         radius_meters = COALESCE(?, radius_meters),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(
      body.name ?? null,
      body.heroData !== undefined ? 1 : 0,
      body.heroData ?? null,
      body.heroData !== undefined ? 1 : 0,
      body.heroData ? await sha256(body.heroData) : null,
      body.latitude ?? null,
      body.longitude ?? null,
      radius,
      shopId,
    )
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT id, public_id AS publicId, name, CASE WHEN hero_data IS NULL OR hero_data = '' THEN NULL ELSE '/api/shops/' || public_id || '/hero?v=' || COALESCE(hero_hash, 'original') END AS heroUrl, latitude, longitude, radius_meters AS radiusMeters, radius_meters, created_at AS createdAt, updated_at AS updatedAt FROM shops WHERE id = ?",
  )
    .bind(shopId)
    .first();
  return c.json({ shop: updated });
});

app.delete("/api/merchant/shops/:id", async (c) => {
  const user = requireUser(c);
  const shopId = c.req.param("id");
  const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?")
    .bind(shopId)
    .first<{ id: string }>();
  if (!shop) jsonError(404, "没有找到这个店铺");

  if (user.role !== "admin") {
    const member = await c.env.DB.prepare(
      "SELECT role FROM shop_members WHERE shop_id = ? AND user_id = ?",
    )
      .bind(shopId, user.id)
      .first<{ role: string }>();
    if (!member || member.role !== "owner") {
      jsonError(403, "只有店铺负责人或管理员才能删除店铺");
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM machines WHERE shop_id = ?").bind(shopId),
    c.env.DB.prepare("DELETE FROM shop_members WHERE shop_id = ?").bind(shopId),
    c.env.DB.prepare("DELETE FROM shops WHERE id = ?").bind(shopId),
  ]);
  return c.json({ ok: true });
});

app.get("/api/merchant/shop-members", async (c) => {
  const user = requireUser(c);
  const shopId = c.req.query("shopId");
  if (!shopId) jsonError(400, "请选择店铺");
  if (!(await canAccessShop(c, user, shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const members = await c.env.DB.prepare(
    `SELECT shop_members.id, shop_members.role, shop_members.created_at AS createdAt,
            identities.username, identities.display_name AS displayName, users.id AS userId
     FROM shop_members
     JOIN users ON users.id = shop_members.user_id
     JOIN auth_identities AS identities ON identities.user_id = users.id AND identities.provider = 'munet'
     WHERE shop_members.shop_id = ?
     ORDER BY shop_members.created_at ASC`,
  )
    .bind(shopId)
    .all();
  return c.json({ members: members.results });
});

app.post("/api/merchant/shop-members", async (c) => {
  const user = requireUser(c);
  const body = shopMemberSchema.parse(await c.req.json());
  if (!(await canAccessShop(c, user, body.shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const target = await c.env.DB.prepare(
    `SELECT users.id FROM users
     JOIN auth_identities AS identities ON identities.user_id = users.id AND identities.provider = 'munet'
     WHERE users.id = ? OR lower(identities.username) = lower(?)`,
  )
    .bind(body.user, body.user)
    .first<{ id: string }>();
  if (!target) jsonError(404, "没有找到这个用户");
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO shop_members (id, shop_id, user_id, role) VALUES (COALESCE((SELECT id FROM shop_members WHERE shop_id = ? AND user_id = ?), ?), ?, ?, ?)",
  )
    .bind(body.shopId, target.id, crypto.randomUUID(), body.shopId, target.id, body.role)
    .run();
  return c.json({ ok: true });
});

app.delete("/api/merchant/shop-members/:id", async (c) => {
  const user = requireUser(c);
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
  const user = requireUser(c);
  const shopId = c.req.query("shopId");
  if (!shopId) jsonError(400, "请选择店铺");
  if (!(await canAccessShop(c, user, shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const machines = await c.env.DB.prepare(
    "SELECT machines.id, machines.public_id AS publicId, machines.shop_id AS shopId, shops.public_id AS shopPublicId, machines.name, machines.enabled, (machines.hinata_password_encrypted IS NOT NULL AND machines.hinata_password_encrypted != '') AS hasPassword, machines.created_at AS createdAt FROM machines JOIN shops ON shops.id = machines.shop_id WHERE machines.shop_id = ? ORDER BY machines.created_at DESC",
  )
    .bind(shopId)
    .all();
  return c.json({ machines: machines.results });
});

app.post("/api/merchant/machines", async (c) => {
  const user = requireUser(c);
  const body = createMachineSchema.parse(await c.req.json());
  if (!(await canAccessShop(c, user, body.shopId))) jsonError(403, "你没有这个店铺的管理权限");
  const shop = await c.env.DB.prepare("SELECT public_id AS publicId FROM shops WHERE id = ?")
    .bind(body.shopId)
    .first<{ publicId: string }>();
  if (!shop) jsonError(404, "没有找到这个店铺");
  const id = crypto.randomUUID();
  const publicId = randomPublicId();
  const encrypted = await encryptSecret(body.hinataUrl, c.env.URL_ENCRYPTION_KEY);
  const encryptedPassword = body.hinataPassword
    ? await encryptSecret(body.hinataPassword, c.env.URL_ENCRYPTION_KEY)
    : null;
  await c.env.DB.prepare(
    "INSERT INTO machines (id, public_id, shop_id, name, hinata_url_encrypted, hinata_password_encrypted, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, publicId, body.shopId, body.name, encrypted, encryptedPassword, body.enabled ? 1 : 0)
    .run();
  return c.json(
    {
      machine: {
        id,
        publicId,
        shopId: body.shopId,
        shopPublicId: shop.publicId,
        name: body.name,
        enabled: body.enabled,
        hasPassword: Boolean(encryptedPassword),
      },
    },
    201,
  );
});

app.patch("/api/merchant/machines/:id", async (c) => patchMachine(c, c.req.param("id")));

app.delete("/api/merchant/machines/:id", async (c) => {
  const user = requireUser(c);
  const machine = await c.env.DB.prepare("SELECT id, shop_id FROM machines WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; shop_id: string }>();
  if (!machine) jsonError(404, "没有找到这台设备");
  if (!(await canAccessShop(c, user, machine.shop_id))) jsonError(403, "你没有这个店铺的管理权限");
  await c.env.DB.prepare("DELETE FROM machines WHERE id = ?").bind(machine.id).run();
  return c.json({ ok: true });
});

app.get("/api/merchant/login-events", async (c) => {
  const user = requireUser(c);
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
  if (error instanceof HTTPException) return error.getResponse();
  if (error instanceof z.ZodError) {
    const message = error.errors[0]?.message || "请检查填写内容";
    return c.json({ error: message, issues: error.flatten() }, 400);
  }
  console.error(error);
  return c.json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
});

async function patchMachine(c: Context<AppBindings>, id: string) {
  const user = requireUser(c);
  const body = patchMachineSchema.parse(await c.req.json());
  const machine = await c.env.DB.prepare("SELECT id, shop_id FROM machines WHERE id = ?")
    .bind(id)
    .first<{ id: string; shop_id: string }>();
  if (!machine) jsonError(404, "没有找到这台设备");
  if (!(await canAccessShop(c, user, machine.shop_id))) jsonError(403, "你没有这个店铺的管理权限");
  const encryptedUrl = body.hinataUrl ? await encryptSecret(body.hinataUrl, c.env.URL_ENCRYPTION_KEY) : null;
  const hasPasswordUpdate = body.hinataPassword !== undefined;
  const encryptedPassword = body.hinataPassword
    ? await encryptSecret(body.hinataPassword, c.env.URL_ENCRYPTION_KEY)
    : null;
  await c.env.DB.prepare(
    `UPDATE machines
     SET name = COALESCE(?, name),
         hinata_url_encrypted = COALESCE(?, hinata_url_encrypted),
         enabled = COALESCE(?, enabled),
         hinata_password_encrypted = CASE WHEN ? = 1 THEN ? ELSE hinata_password_encrypted END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(
      body.name ?? null,
      encryptedUrl,
      typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : null,
      hasPasswordUpdate ? 1 : 0,
      encryptedPassword,
      id,
    )
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
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
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
           identities.display_name AS userName,
           cards.label AS cardLabel
    FROM machine_login_events
    LEFT JOIN machines ON machines.id = machine_login_events.machine_id
    LEFT JOIN shops ON shops.id = machines.shop_id
    LEFT JOIN shop_members ON shop_members.shop_id = shops.id
    LEFT JOIN users ON users.id = machine_login_events.user_id
    LEFT JOIN auth_identities AS identities ON identities.user_id = users.id AND identities.provider = 'munet'
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

function safePath(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && value.length <= 500 ? value : "/cards";
}

export default app;
