import { describe, expect, it } from "vitest";
import { munetAuthorizeUrl } from "../src/munet";

describe("MuNET OAuth", () => {
  it("requests the login and card scopes", () => {
    const url = new URL(munetAuthorizeUrl("client", "https://example.com/callback", "state"));
    expect(url.origin + url.pathname).toBe("https://auth.mumur.net:550/connect/authorize");
    expect(url.searchParams.get("scope")).toBe("openid profile cards");
    expect(url.searchParams.get("state")).toBe("state");
  });
});
