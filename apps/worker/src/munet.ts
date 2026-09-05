import { z } from "zod";

const authOrigin = "https://auth.mumur.net:550";

const tokenSchema = z.object({ access_token: z.string().min(1) });
const cardSchema = z.object({
  luid: z.string().regex(/^\d{20}$/),
  remark: z.string().nullish(),
});
const profileSchema = z.object({
  sub: z.string().min(1),
  name: z.string().min(1),
  preferred_username: z.string().min(1),
});
const cardsSchema = cardSchema.array();

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
}): Promise<{ subject: string; name: string; username: string; cards: MunetCard[] }> {
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

  const cardsResponse = await fetch(`${authOrigin}/connect/cards`, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
  });
  if (!cardsResponse.ok) throw new Error("无法读取 MuNET 卡片");

  return {
    subject: profile.sub,
    name: profile.name,
    username: profile.preferred_username,
    cards: cardsSchema.parse(await cardsResponse.json()),
  };
}
