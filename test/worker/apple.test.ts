import { describe, expect, it } from "vitest";
import { appleAppSiteAssociation } from "../../worker/apple";

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
