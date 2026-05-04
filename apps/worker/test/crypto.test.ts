import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashPassword, sha256, verifyPassword } from "../src/crypto";

describe("crypto helpers", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("hashes sessions and encrypts machine URLs", async () => {
    await expect(sha256("session-token")).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
    const encrypted = await encryptSecret("https://aime-ws.neri.moe/example", "secret");
    expect(encrypted).not.toContain("aime-ws");
    await expect(decryptSecret(encrypted, "secret")).resolves.toBe("https://aime-ws.neri.moe/example");
  });
});
