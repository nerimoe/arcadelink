import { describe, expect, it } from "vitest";
import { accessCodeSchema } from "../src/validators";

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
