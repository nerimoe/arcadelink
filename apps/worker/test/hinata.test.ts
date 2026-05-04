import { describe, expect, it, vi } from "vitest";
import { sendHinataCard } from "../src/hinata";

describe("HINATA sender", () => {
  it("posts aime card payload to the target URL", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendHinataCard("https://aime-ws.neri.moe/instance", "12345678901234567890")).resolves.toMatchObject({
      ok: true,
      status: 204,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://aime-ws.neri.moe/instance",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "aime", value: "12345678901234567890" }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
