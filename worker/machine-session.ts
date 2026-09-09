import type { Context } from "hono";
import { randomToken } from "./crypto";
import { getMachineByPublicId } from "./db";
import { jsonError } from "./http";
import type { AppBindings, MachineRow } from "./types";

export const machineSessionTtlSeconds = 300;

export type MachineSession = {
  ticket: string;
  expiresIn: number;
  publicId: string;
  machine: MachineRow;
};

export async function createMachineSession(
  c: Context<AppBindings>,
  shopCode: string,
  publicId: string,
): Promise<MachineSession> {
  const normalizedShopCode = shopCode.trim();
  const normalizedPublicId = publicId.trim();
  const machine = await getMachineByPublicId(c.env.DB, normalizedPublicId);
  if (!machine || machine.enabled !== 1 || machine.shop_public_id !== normalizedShopCode) {
    jsonError(404, "机台不可用");
  }

  const ticket = randomToken(24);
  await c.env.RATE_LIMIT.put(`ticket:${ticket}`, machine.public_id, {
    expirationTtl: machineSessionTtlSeconds,
  });
  await c.env.RATE_LIMIT.put(`ticket:${machine.public_id}:${ticket}`, "1", {
    expirationTtl: machineSessionTtlSeconds,
  });

  return {
    ticket,
    expiresIn: machineSessionTtlSeconds,
    publicId: machine.public_id,
    machine,
  };
}

export async function resolveMachineSession(
  c: Context<AppBindings>,
  ticket: string,
  routePublicId?: string,
): Promise<{ publicId: string; machine: MachineRow }> {
  const normalizedTicket = ticket.trim();
  const normalizedRoutePublicId = routePublicId?.trim();
  if (!normalizedTicket) jsonError(403, "本次会话已失效");

  let publicId = await c.env.RATE_LIMIT.get(`ticket:${normalizedTicket}`);
  if (!publicId && normalizedRoutePublicId) {
    if (await c.env.RATE_LIMIT.get(`ticket:${normalizedRoutePublicId}:${normalizedTicket}`)) {
      publicId = normalizedRoutePublicId;
    }
  }
  if (!publicId) jsonError(403, "本次会话已失效");

  const machine = await getMachineByPublicId(c.env.DB, publicId);
  if (!machine || machine.enabled !== 1) jsonError(404, "机台不可用");
  return { publicId: machine.public_id, machine };
}

export function publicMachine(machine: MachineRow) {
  return {
    publicId: machine.public_id,
    name: machine.name,
    shop: {
      name: machine.shop_name,
      heroUrl: machine.shop_hero_url,
      latitude: machine.latitude,
      longitude: machine.longitude,
      radiusMeters: machine.radius_meters,
    },
  };
}
