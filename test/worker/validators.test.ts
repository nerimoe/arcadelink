import { describe, expect, it } from "vitest";
import { accessCodeSchema, machineLoginSchema, setUserRoleSchema } from "../../worker/validators";

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

