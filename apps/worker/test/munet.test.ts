import { afterEach, describe, expect, it, vi } from "vitest";
import { finishMunetAuth, munetAuthorizeUrl } from "../src/munet";

afterEach(() => vi.restoreAllMocks());

describe("MuNET OAuth", () => {
  it("requests the login and card scopes", () => {
    const url = new URL(munetAuthorizeUrl("client", "https://example.com/callback", "state"));
    expect(url.origin + url.pathname).toBe("https://auth.mumur.net:550/connect/authorize");
    expect(url.searchParams.get("scope")).toBe("openid profile cards");
    expect(url.searchParams.get("state")).toBe("state");
  });

  it("reads cards from the OAuth resource endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockResolvedValueOnce(Response.json({ sub: "user", name: "Player", preferred_username: "player" }))
      .mockResolvedValueOnce(Response.json([
        { luid: "12345678901234567890", remark: "main" },
      ]));

    const result = await finishMunetAuth({
      clientId: "client",
      clientSecret: "secret",
      code: "code",
      redirectUri: "https://example.com/callback",
    });

    expect(result.cards).toEqual([{ luid: "12345678901234567890", remark: "main" }]);
    expect(result).toMatchObject({ subject: "user", name: "Player", username: "player" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://auth.mumur.net:550/connect/cards");
  });
});
