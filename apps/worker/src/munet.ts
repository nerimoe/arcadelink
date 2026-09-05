import { z } from "zod";

const authOrigin = "https://auth.mumur.net:550";
const cardApis = ["https://apidashboard3-cf.mumur.net", "https://apidashboard3.mumur.net:42081"];

const tokenSchema = z.object({ access_token: z.string().min(1) });
const cardSchema = z.object({
  luid: z.string().regex(/^\d{20}$/),
  remark: z.string().nullish(),
});
const profileSchema = z.object({
  sub: z.string().min(1),
});
const homeSchema = z.object({ cards: cardSchema.array() });

export type MunetCard = z.infer<typeof cardSchema>;

export function munetAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(`${authOrigin}/connect/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile cards",
    state,
  }).toString();
  return url.toString();
}

export async function finishMunetAuth(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ subject: string; cards: MunetCard[] }> {
  const tokenResponse = await fetch(`${authOrigin}/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error("MuNET 授权失败");
  const { access_token: accessToken } = tokenSchema.parse(await tokenResponse.json());

  const profileResponse = await fetch(`${authOrigin}/connect/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) throw new Error("无法读取 MuNET 账号");
  const profile = profileSchema.parse(await profileResponse.json());

  const statuses: string[] = [];
  for (const origin of cardApis) {
    try {
      const response = await fetch(`${origin}/api/v3/UserHome?locale=zh-Hans`, {
        headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) return { subject: profile.sub, cards: homeSchema.parse(await response.json()).cards };
      statuses.push(`${origin}:${response.status}`);
    } catch {
      statuses.push(`${origin}:network_error`);
    }
  }
  console.error("MuNET card API failed", { statuses, token: tokenMetadata(accessToken) });
  throw new Error("无法读取 MuNET 卡片");
}

function tokenMetadata(token: string): unknown {
  try {
    const encoded = token.split(".")[1]!.replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return { aud: payload.aud, scope: payload.scope };
  } catch {
    return "opaque";
  }
}
