export const appClipBundleId = "moe.neri.hinatago.ArcadeLink";
export const fullAppBundleId = "moe.neri.hinatago";

export function appleAppSiteAssociation(teamId: string) {
  const appId = `${teamId}.${appClipBundleId}`;
  const fullAppId = `${teamId}.${fullAppBundleId}`;
  return {
    appclips: {
      apps: [appId],
    },
    applinks: {
      details: [
        {
          appIDs: [fullAppId],
          components: [{ "/": "/t/*" }],
        },
      ],
    },
    webcredentials: {
      apps: [fullAppId, appId],
    },
  };
}

export function appleAppSiteAssociationResponse(teamId: string): Response {
  return new Response(JSON.stringify(appleAppSiteAssociation(teamId)), {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "application/json",
    },
  });
}
