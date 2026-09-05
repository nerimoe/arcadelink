import { describe, expect, it } from "vitest";
import { passkeyErrorMessage } from "./passkeys";

describe("passkeyErrorMessage", () => {
  it("hides browser-specific cancellation details", () => {
    const error = new Error("The operation is not allowed because the page does not have focus");
    error.name = "NotAllowedError";

    expect(passkeyErrorMessage(error)).toBe("未完成 Passkey 验证，请重试或稍后设置");
  });
});
