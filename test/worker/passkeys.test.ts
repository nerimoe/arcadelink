import { describe, expect, it } from "vitest";
import { passkeyProviderName } from "../../worker/passkeys";

describe("passkey provider names", () => {
  it("recognizes common synced passkey providers", () => {
    expect(passkeyProviderName("fbfc3007-154e-4ecc-8c0b-6e020557d7bd")).toBe("Apple Passwords");
    expect(passkeyProviderName("EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4")).toBe("Google Password Manager");
  });

  it("leaves unknown providers unnamed", () => {
    expect(passkeyProviderName("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
