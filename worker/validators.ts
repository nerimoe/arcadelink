import { z } from "zod";
import { normalizeHinataUrl } from "./hinata";

export const accessCodeSchema = z.string().regex(/^[0-24-9]\d{19}$/, "卡片号码必须为20位数字且不能以3开头");

export const createCardSchema = z.object({
  label: z.string().trim().min(1).max(40),
  accessCode: accessCodeSchema,
});

export const createShopSchema = z.object({
  name: z.string().trim().min(1, "请输入店铺名称").max(80, "店铺名称最多80个字符"),
  latitude: z.number().gte(-90, "纬度不正确").lte(90, "纬度不正确"),
  longitude: z.number().gte(-180, "经度不正确").lte(180, "经度不正确"),
  radiusMeters: z.number().gte(30, "允许距离最小为 30 米").lte(1000, "允许距离最大为 1000 米").default(80),
});

export const patchShopSchema = createShopSchema.partial();

export const createMachineSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  hinataUrl: z
    .string()
    .trim()
    .transform(normalizeHinataUrl)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    }, "请填写正确的机台连接地址"),
  hinataPassword: z.string().trim().max(128).optional().nullable(),
  enabled: z.boolean().default(true),
});

export const patchMachineSchema = createMachineSchema.partial();

export const machineLoginSchema = z.object({
  cardId: z.string().min(1, "请选择卡片"),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracy: z.number().min(0).max(10_000),
  ticket: z.string({ required_error: "缺少会话凭证" }).min(1, "缺少会话凭证"),
  clientTimestamp: z.string().optional(),
});

export const setUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["user", "admin"]),
});

export const passkeyLabelSchema = z.string().trim().min(1).max(60);

export const passkeyNameSchema = z.object({
  name: passkeyLabelSchema,
});

export const shopMemberSchema = z.object({
  shopId: z.string().min(1),
  user: z.string().trim().min(1).max(80),
  role: z.enum(["owner", "staff"]).default("staff"),
});

export const createBanSchema = z.object({
  subjectType: z.enum(["user", "ip", "card", "machine"]),
  subjectValue: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(200),
  expiresAt: z.string().datetime().optional(),
});
