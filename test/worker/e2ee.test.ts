import { describe, expect, it } from "vitest";
import { fromBase64Url } from "../../worker/crypto";
import { decryptE2EE, encryptE2EE, type EncryptedEnvelope } from "../../worker/e2ee";

describe("E2EE crypto", () => {
  const password = "test-remote-password";
  const plaintext = {
    action: "KEY_PRESS",
    body: { key: 32, count: 1 },
  };
  const messageId = "00000000-0000-4000-8000-000000000001";
  const expiresAt = 1700000000123;
  const salt = fromBase64Url("ABEiM0RVZneImaq7zN3u_w");
  const nonce = fromBase64Url("Dw4NDAsKCQgHBgUE");

  const fixedFixture: EncryptedEnvelope = {
    action: "E2EE_V1",
    body: {
      salt: "ABEiM0RVZneImaq7zN3u_w",
      nonce: "Dw4NDAsKCQgHBgUE",
      message_id: messageId,
      expires_at: expiresAt,
      ciphertext: "2boPibGx_ErUB0K-8w2NPYaA6IK549jlVYQcZHoi_RAolCk7w8ktNj2WuKpVNftgGxS_08ksxVs97mw5l2Y-6JVv",
    },
  };

  it("decrypts the shared Rust/Dart fixture", async () => {
    const decrypted = await decryptE2EE(password, fixedFixture);
    expect(decrypted).toEqual(plaintext);
  });

  it("produces the shared fixture when nonce and salt are fixed", async () => {
    const envelope = await encryptE2EE({
      password,
      message: plaintext,
      salt,
      nonce,
      messageId,
      expiresAt,
    });
    expect(envelope).toEqual(fixedFixture);
  });

  it("encrypts and decrypts round-trip with auto salt and nonce", async () => {
    const message = {
      action: "SET_CARD",
      body: { type: "aime", value: "01234567890123456789", disposable: true },
    };
    const envelope = await encryptE2EE({
      password: "arcade-secret-key",
      message,
    });
    expect(envelope.action).toBe("E2EE_V1");
    expect(envelope.body.salt).toHaveLength(22); // 16 bytes base64url is 22 chars
    expect(envelope.body.nonce).toHaveLength(16); // 12 bytes base64url is 16 chars

    const decrypted = await decryptE2EE("arcade-secret-key", envelope);
    expect(decrypted).toEqual(message);
  });

  it("fails to decrypt with incorrect password", async () => {
    await expect(decryptE2EE("wrong-password", fixedFixture)).rejects.toThrow();
  });
});
