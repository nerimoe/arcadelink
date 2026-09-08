import { describe, expect, it } from "vitest";
import { androidAssetLinks, androidPasskeyOrigins, appleAppSiteAssociation } from "../../worker/apple";

describe("apple app site association", () => {
  it("connects the App Clip and full app to the machine URL", () => {
    expect(appleAppSiteAssociation("TEAM123")).toEqual({
      appclips: { apps: ["TEAM123.moe.neri.hinatago.ArcadeLink"] },
      applinks: {
        details: [
          {
            appIDs: ["TEAM123.moe.neri.hinatago"],
            components: [{ "/": "/t/*" }],
          },
        ],
      },
      webcredentials: {
        apps: [
          "TEAM123.moe.neri.hinatago",
          "TEAM123.moe.neri.hinatago.ArcadeLink",
        ],
      },
    });
  });
});

describe("android passkey association", () => {
  const fingerprint = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

  it("normalizes certificate fingerprints for Digital Asset Links", () => {
    expect(androidAssetLinks(fingerprint)).toEqual([
      {
        relation: [
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: "moe.neri.hinatago",
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ]);
  });

  it("maps the same certificate to the Android WebAuthn origin", () => {
    expect(androidPasskeyOrigins(fingerprint)).toEqual([
      "android:apk-key-hash:qrvM3e7_ABEiM0RVZneImaq7zN3u_wARIjNEVWZ3iJk",
    ]);
  });
});
