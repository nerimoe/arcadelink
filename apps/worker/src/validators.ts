import { z } from "zod";

export const emailSchema = z.string().email().transform((value) => value.toLowerCase().trim());
export const passwordSchema = z.string().min(8).max(128);
export const accessCodeSchema = z.string().regex(/^\d{20}$/, "请输入完整的卡片号码");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: z.string().optional(),
});

export const loginSchema = registerSchema;

export const createCardSchema = z.object({
  label: z.string().trim().min(1).max(40),
  accessCode: accessCodeSchema,
});

export const createShopSchema = z.object({
  name: z.string().trim().min(1).max(80),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  radiusMeters: z.number().gte(30).lte(200).default(80),
});

export const createMachineSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  hinataUrl: z.string().url().refine((value) => value.startsWith("https://"), "请填写正确的机台连接地址"),
  enabled: z.boolean().default(true),
});

export const patchMachineSchema = createMachineSchema.partial();

export const machineLoginSchema = z.object({
  cardId: z.string().min(1),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracy: z.number().min(0).max(10_000),
  clientTimestamp: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export const setUserRoleSchema = z.object({
  email: emailSchema,
  role: z.enum(["user", "merchant", "admin"]),
});

export const shopMemberSchema = z.object({
  shopId: z.string().min(1),
  email: emailSchema,
  role: z.enum(["owner", "staff"]).default("staff"),
});

export const createBanSchema = z.object({
  subjectType: z.enum(["user", "ip", "card", "machine"]),
  subjectValue: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(200),
  expiresAt: z.string().datetime().optional(),
});
