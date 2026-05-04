import { describe, expect, it } from "vitest";
import { checkLocation, clampShopRadius, haversineMeters } from "../src/geo";

describe("geo checks", () => {
  it("clamps shop radius to the configured policy", () => {
    expect(clampShopRadius(5)).toBe(30);
    expect(clampShopRadius(80)).toBe(80);
    expect(clampShopRadius(400)).toBe(200);
  });

  it("allows users inside the radius plus accuracy tolerance", () => {
    const result = checkLocation({
      userLat: 35.681236,
      userLng: 139.767125,
      accuracy: 50,
      shopLat: 35.6812,
      shopLng: 139.7671,
      radiusMeters: 80,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("ok");
  });

  it("blocks low accuracy and far-away locations", () => {
    expect(
      checkLocation({
        userLat: 35.681236,
        userLng: 139.767125,
        accuracy: 251,
        shopLat: 35.6812,
        shopLng: 139.7671,
        radiusMeters: 80,
      }).reason,
    ).toBe("low_accuracy");

    expect(haversineMeters(35.681236, 139.767125, 35.689634, 139.692101)).toBeGreaterThan(5_000);
  });
});
