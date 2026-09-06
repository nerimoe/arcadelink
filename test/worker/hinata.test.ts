import { describe, expect, it, vi } from "vitest";
import { decryptE2EE } from "../../worker/e2ee";
import { sendHinataCard } from "../../worker/hinata";

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

  it("posts encrypted E2EE_V1 payload when password is provided", async () => {
    let capturedBody = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendHinataCard("https://aime-ws.neri.moe/instance", "12345678901234567890", "my-secret-pass"),
    ).resolves.toMatchObject({
      ok: true,
      status: 204,
    });

    const parsed = JSON.parse(capturedBody);
    expect(parsed.action).toBe("E2EE_V1");
    const decrypted = await decryptE2EE("my-secret-pass", parsed);
    expect(decrypted).toEqual({
      action: "SET_CARD",
      body: { type: "aime", value: "12345678901234567890", disposable: true },
    });

    vi.unstubAllGlobals();
  });

  it("normalizes wss/ws schemes, trailing slashes, and whitespace", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendHinataCard("  wss://aime-ws.neri.moe/QOr59IMwymSWu6DL8FdVBekq/  ", "12345678901234567890");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://aime-ws.neri.moe/QOr59IMwymSWu6DL8FdVBekq",
      expect.anything(),
    );

    await sendHinataCard("ws://example.com/channel/", "12345678901234567890");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://example.com/channel",
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it("returns helpful message when remote machine is not connected (404)", async () => {
    const fetchMock = vi.fn(async () => new Response("No active client connected", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendHinataCard("https://aime-ws.neri.moe/instance", "12345678901234567890");
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "机台未在线或连接地址不正确",
    });
    vi.unstubAllGlobals();
  });
});
