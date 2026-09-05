import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, sha256 } from "../src/crypto";

describe("crypto helpers", () => {
  it("hashes sessions and encrypts machine URLs", async () => {
    await expect(sha256("session-token")).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
    const encrypted = await encryptSecret("https://aime-ws.neri.moe/example", "secret");
    expect(encrypted).not.toContain("aime-ws");
    await expect(decryptSecret(encrypted, "secret")).resolves.toBe("https://aime-ws.neri.moe/example");
  });
});
