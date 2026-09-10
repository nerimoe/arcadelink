import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it, vi } from "vitest";
import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../../worker/types";
import app from "../../worker/index";
import { sha256 } from "../../worker/crypto";

type Shop = { id: string; publicId: string; heroUrl: string };
const readShop = async (response: Response) => (await response.json() as { shop: Shop }).shop;
const readShops = async (response: Response) => (await response.json() as { shops: Shop[] }).shops;

vi.mock("../../worker/auth", async (original) => ({
  ...await original<typeof import("../../worker/auth")>(),
  attachUser: (async (c, next) => {
    c.set("user", { id: "owner", username: "owner", displayName: "Owner", role: "admin", bannedAt: null });
    await next();
  }) satisfies MiddlewareHandler<AppBindings>,
}));

it("persists cover versions and never changes the content of an immutable URL", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${file}`, "utf8"));
    db.exec("INSERT INTO users (id) VALUES ('owner')");
    // Execute real production SQL; only adapt SQLite's interface to the D1 calls in this flow.
    const prepare = (sql: string) => {
      const statement = db.prepare(sql);
      let values: SQLInputValue[] = [];
      const bound = {
        bind(...args: SQLInputValue[]) { values = args; return bound; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return statement.run(...values); },
      };
      return bound;
    };
    const env = {
      APP_ORIGIN: "https://link.neri.moe",
      DB: { prepare, batch: (statements: ReturnType<typeof prepare>[]) => Promise.all(statements.map((s) => s.run())) },
      RATE_LIMIT: { put: async () => {}, get: async () => null },
    };
    const write = (path: string, method: string, body: object) => app.request(path, {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }, env);
    const firstImage = "data:image/webp;base64,Y292ZXIx";
    const secondImage = "data:image/webp;base64,Y292ZXIy";
    const created = await write("/api/merchant/shops", "POST", { name: "Shop", heroData: firstImage, latitude: 35, longitude: 139 });
    expect(created.status).toBe(201);
    const shop = await readShop(created);
    const firstURL = shop.heroUrl;
    expect(firstURL).toBe(`/api/shops/${shop.publicId}/hero?v=${await sha256(firstImage)}`);
    db.prepare("INSERT INTO machines (id, public_id, shop_id, name, hinata_url_encrypted) VALUES ('machine', 'machine', ?, 'Machine', 'test')").run(shop.id);

    const response = await app.request(firstURL, {}, env);
    expect(await response.text()).toBe("cover1");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const etag = response.headers.get("etag")!;
    const conditional = await app.request(firstURL, { headers: { "if-none-match": `"other", W/${etag}` } }, env);
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");

    const unchanged = await write(`/api/merchant/shops/${shop.id}`, "PATCH", { name: "Renamed", heroData: firstImage });
    expect((await readShop(unchanged)).heroUrl).toBe(firstURL);
    const replaced = await write(`/api/merchant/shops/${shop.id}`, "PATCH", { heroData: secondImage });
    const secondURL = (await readShop(replaced)).heroUrl;
    expect(secondURL).not.toBe(firstURL);
    expect(await (await app.request(secondURL, {}, env)).text()).toBe("cover2");
    const stale = await app.request(firstURL, {}, env);
    expect(stale.status).toBe(404);
    expect(stale.headers.get("cache-control")).toBe("no-store");
    const listed = await readShops(await app.request("/api/merchant/shops", {}, env));
    expect(listed[0]?.heroUrl).toBe(secondURL);
    const session = await write("/api/machines/session/start", "POST", { shopCode: shop.publicId, publicId: "machine" });
    expect(await session.json()).toMatchObject({ machine: { shop: { heroUrl: secondURL } } });

    const unversioned = await app.request(`/api/shops/${shop.publicId}/hero`, {}, env);
    expect(unversioned.headers.get("cache-control")).toBe("public, max-age=60, must-revalidate");
    await write(`/api/merchant/shops/${shop.id}`, "PATCH", { heroData: null });
    expect((await app.request(secondURL, {}, env)).status).toBe(404);
    expect((await readShops(await app.request("/api/merchant/shops", {}, env)))[0]?.heroUrl).toBeNull();

    // Existing pre-migration covers work immediately without downloading/re-uploading them.
    db.prepare("UPDATE shops SET hero_data = ?, hero_hash = NULL WHERE id = ?").run(firstImage, shop.id);
    const original = (await readShops(await app.request("/api/merchant/shops", {}, env)))[0]!.heroUrl;
    expect(original).toMatch(/\?v=original$/);
    expect((await app.request(original, {}, env)).status).toBe(200);
  } finally {
    db.close();
  }
});
