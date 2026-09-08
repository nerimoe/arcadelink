import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../worker/index";
import { consumeAppClipAuthState, createAppClipAuthState } from "../../worker/munet-appclip";
import { finishMunetAuth } from "../../worker/munet";

vi.mock("../../worker/risk", () => ({ enforceRateLimits: vi.fn() }));
vi.mock("../../worker/munet", async (original) => ({
  ...await original<typeof import("../../worker/munet")>(),
  finishMunetAuth: vi.fn(),
}));
vi.mock("../../worker/munet-appclip", async (original) => ({
  ...await original<typeof import("../../worker/munet-appclip")>(),
  createAppClipAuthState: vi.fn(),
  consumeAppClipAuthState: vi.fn(),
  provisionMunetUser: vi.fn(async () => ({ userId: "test-user", isNewUser: false })),
  createAppClipAuthCode: vi.fn(async () => "one-time-code"),
}));

const env = { APP_ORIGIN: "https://link.neri.moe", MUNET_CLIENT_ID: "test", MUNET_CLIENT_SECRET: "test" };

describe("shared MuNET callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the same redirect URI during token exchange and returns only an exchange code", async () => {
    vi.mocked(consumeAppClipAuthState).mockResolvedValue(true);
    const response = await app.request("/callback?state=appclip.valid&code=provider-code", {}, env);
    expect(finishMunetAuth).toHaveBeenCalledWith(expect.objectContaining({
      code: "provider-code", redirectUri: `${env.APP_ORIGIN}/callback`,
    }));
    expect(response.headers.get("location")).toBe("hinata-arcadelink-auth://callback?code=one-time-code");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("starts native login with the already registered web redirect URI", async () => {
    const response = await app.request("/api/appclip/auth/start", {}, env);
    const url = new URL(response.headers.get("location")!);
    expect(url.searchParams.get("redirect_uri")).toBe(`${env.APP_ORIGIN}/callback`);
    expect(url.searchParams.get("state")).toMatch(/^appclip\./);
    expect(createAppClipAuthState).toHaveBeenCalledWith(expect.anything(), url.searchParams.get("state"));
  });

  it("does not accept a forged or replayed native state", async () => {
    vi.mocked(consumeAppClipAuthState).mockResolvedValue(false);
    const response = await app.request("/callback?state=appclip.forged&code=forged", {}, env);
    const url = new URL(response.headers.get("location")!);
    expect(url.protocol).toBe("hinata-arcadelink-auth:");
    expect(url.searchParams.has("error")).toBe(true);
    expect(url.searchParams.has("code")).toBe(false);
  });

  it("returns a validated native cancellation to the app without clearing web cookies", async () => {
    vi.mocked(consumeAppClipAuthState).mockResolvedValue(true);
    const response = await app.request("/callback?state=appclip.valid&error=access_denied", {}, env);
    expect(consumeAppClipAuthState).toHaveBeenCalledWith(expect.anything(), "appclip.valid");
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("MuNET 授权已取消");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps unprefixed callbacks on the browser flow", async () => {
    const response = await app.request("/callback?state=web&error=access_denied", {}, env);
    expect(response.headers.get("location")).toMatch(/^\/login\?/);
    expect(consumeAppClipAuthState).not.toHaveBeenCalled();
  });

  it("retains the legacy native callback", async () => {
    vi.mocked(consumeAppClipAuthState).mockResolvedValue(false);
    const response = await app.request("/api/appclip/auth/callback?state=old", {}, env);
    expect(response.headers.get("location")).toMatch(/^hinata-arcadelink-auth:/);
  });
});
