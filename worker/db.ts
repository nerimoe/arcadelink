import type { Context } from "hono";
import type { AppBindings, AuthUser, MachineRow, ShopRow } from "./types";

export async function canAccessShop(c: Context<AppBindings>, user: AuthUser, shopId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  const row = await c.env.DB.prepare("SELECT id FROM shop_members WHERE shop_id = ? AND user_id = ?")
    .bind(shopId, user.id)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function listShopsForUser(c: Context<AppBindings>, user: AuthUser): Promise<ShopRow[]> {
  if (user.role === "admin") {
    return (await c.env.DB.prepare("SELECT * FROM shops ORDER BY created_at DESC").all<ShopRow>()).results;
  }
  return (
    await c.env.DB.prepare(
      `SELECT shops.*
       FROM shops
       JOIN shop_members ON shop_members.shop_id = shops.id
       WHERE shop_members.user_id = ?
       ORDER BY shops.created_at DESC`,
    )
      .bind(user.id)
      .all<ShopRow>()
  ).results;
}

export async function getMachineByPublicId(db: D1Database, publicId: string): Promise<MachineRow | null> {
  return db
    .prepare(
      `SELECT machines.*, shops.name AS shop_name, shops.latitude, shops.longitude, shops.radius_meters
       FROM machines
       JOIN shops ON shops.id = machines.shop_id
       WHERE machines.public_id = ?`,
    )
    .bind(publicId)
    .first<MachineRow>();
}
