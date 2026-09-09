import { describe, expect, it } from "vitest";
import {
  accessCodeSchema,
  appClipAuthExchangeSchema,
  createMachineSchema,
  createShopSchema,
  machineLoginSchema,
  machineSessionStartSchema,
  patchShopSchema,
  setUserRoleSchema,
} from "../../worker/validators";

describe("accessCodeSchema", () => {
  it("accepts valid 20-digit access codes not starting with 3", () => {
    expect(accessCodeSchema.parse("01234567890123456789")).toBe("01234567890123456789");
    expect(accessCodeSchema.parse("10000000000000000000")).toBe("10000000000000000000");
    expect(accessCodeSchema.parse("42345678901234567890")).toBe("42345678901234567890");
  });

  it("rejects access codes starting with 3", () => {
    expect(() => accessCodeSchema.parse("31234567890123456789")).toThrow("卡片号码必须为20位数字且不能以3开头");
  });

  it("rejects access codes with invalid lengths or non-numeric characters", () => {
    expect(() => accessCodeSchema.parse("123")).toThrow();
    expect(() => accessCodeSchema.parse("123456789012345678901")).toThrow();
    expect(() => accessCodeSchema.parse("1234567890123456789a")).toThrow();
  });
});

describe("setUserRoleSchema", () => {
  it("accepts user and admin roles", () => {
    expect(setUserRoleSchema.parse({ userId: "u1", role: "user" })).toEqual({ userId: "u1", role: "user" });
    expect(setUserRoleSchema.parse({ userId: "u2", role: "admin" })).toEqual({ userId: "u2", role: "admin" });
  });

  it("rejects merchant role", () => {
    expect(() => setUserRoleSchema.parse({ userId: "u3", role: "merchant" })).toThrow();
  });
});

describe("machineLoginSchema", () => {
  it("accepts valid machine login payload with ticket", () => {
    const payload = {
      cardId: "card_123",
      lat: 35.6895,
      lng: 139.6917,
      accuracy: 15,
      ticket: "ticket_token_abc",
    };
    expect(machineLoginSchema.parse(payload)).toMatchObject(payload);
  });

  it("rejects machine login payload without ticket", () => {
    expect(() =>
      machineLoginSchema.parse({
        cardId: "card_123",
        lat: 35.6895,
        lng: 139.6917,
        accuracy: 15,
      })
    ).toThrow("缺少会话凭证");
  });
});

describe("machineSessionStartSchema", () => {
  it("trims a public shop code and machine id", () => {
    expect(
      machineSessionStartSchema.parse({
        shopCode: "  shop-123  ",
        publicId: "  L9W3HD2P  ",
      }),
    ).toEqual({ shopCode: "shop-123", publicId: "L9W3HD2P" });
  });

  it("rejects a missing public machine id", () => {
    expect(() => machineSessionStartSchema.parse({ shopCode: "shop-123", publicId: "" })).toThrow("缺少机台编号");
  });
});

describe("appClipAuthExchangeSchema", () => {
  it("trims a short-lived native exchange code", () => {
    expect(appClipAuthExchangeSchema.parse({ code: "  one-time-code  " })).toEqual({
      code: "one-time-code",
    });
  });

  it("rejects a missing exchange code", () => {
    expect(() => appClipAuthExchangeSchema.parse({ code: "" })).toThrow("缺少授权码");
  });
});

describe("createShopSchema", () => {
  it("accepts valid shop with 400m radius", () => {
    const parsed = createShopSchema.parse({
      name: "秋叶原机厅",
      latitude: 35.6983,
      longitude: 139.7731,
      radiusMeters: 400,
    });
    expect(parsed.radiusMeters).toBe(400);
  });

  it("rejects radius smaller than 30 or larger than 1000", () => {
    expect(() =>
      createShopSchema.parse({
        name: "店铺",
        latitude: 35.0,
        longitude: 139.0,
        radiusMeters: 20,
      })
    ).toThrow("允许距离最小为 30 米");

    expect(() =>
      createShopSchema.parse({
        name: "店铺",
        latitude: 35.0,
        longitude: 139.0,
        radiusMeters: 1500,
      })
    ).toThrow("允许距离最大为 1000 米");
  });
});

describe("patchShopSchema", () => {
  it("accepts partial shop updates", () => {
    expect(patchShopSchema.parse({ name: "新名称" })).toEqual({ name: "新名称" });
    expect(patchShopSchema.parse({ radiusMeters: 500 })).toEqual({ radiusMeters: 500 });
    expect(patchShopSchema.parse({ latitude: 31.23, longitude: 121.47 })).toEqual({
      latitude: 31.23,
      longitude: 121.47,
    });
  });

  it("validates fields when provided", () => {
    expect(() => patchShopSchema.parse({ radiusMeters: 2000 })).toThrow("允许距离最大为 1000 米");
    expect(() => patchShopSchema.parse({ name: "" })).toThrow("请输入店铺名称");
  });
});

describe("createMachineSchema", () => {
  it("normalizes wss to https and strips trailing slashes", () => {
    const parsed = createMachineSchema.parse({
      shopId: "shop_1",
      name: "maimai",
      hinataUrl: "  wss://aime-ws.neri.moe/QOr59IMwymSWu6DL8FdVBekq/  ",
    });
    expect(parsed.hinataUrl).toBe("https://aime-ws.neri.moe/QOr59IMwymSWu6DL8FdVBekq");
  });

  it("normalizes trailing slash on https urls", () => {
    const parsed = createMachineSchema.parse({
      shopId: "shop_1",
      name: "chuni",
      hinataUrl: "https://aime-ws.neri.moe/QOr59IMwymSWu6DL8FdVBekq/",
    });
    expect(parsed.hinataUrl).toBe("https://aime-ws.neri.moe/QOr59IMwymSWu6DL8FdVBekq");
  });

  it("rejects non-http/non-ws protocols or invalid urls", () => {
    expect(() =>
      createMachineSchema.parse({
        shopId: "shop_1",
        name: "bad",
        hinataUrl: "ftp://example.com/not-allowed",
      })
    ).toThrow("请填写正确的机台连接地址");
  });
});
