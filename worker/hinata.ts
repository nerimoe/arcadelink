import { encryptE2EE } from "./e2ee";

export type HinataResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export function normalizeHinataUrl(targetUrl: string): string {
  let url = targetUrl.trim();
  if (/^wss:\/\//i.test(url)) {
    url = "https://" + url.slice(6);
  } else if (/^ws:\/\//i.test(url)) {
    url = "http://" + url.slice(5);
  }
  return url.replace(/\/+$/, "");
}

export async function sendHinataCard(
  targetUrl: string,
  accessCode: string,
  password?: string | null,
): Promise<HinataResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 10_000);
  try {
    const normalizedUrl = normalizeHinataUrl(targetUrl);
    const payload = password
      ? await encryptE2EE({
          password,
          message: {
            action: "SET_CARD",
            body: { type: "aime", value: accessCode, disposable: true },
          },
        })
      : { type: "aime", value: accessCode };

    const response = await fetch(normalizedUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.ok) return { ok: true, status: response.status };
    if (response.status === 404) {
      return { ok: false, status: 404, error: "机台未在线或连接地址不正确" };
    }
    return { ok: false, status: response.status, error: "机台暂时没有响应" };
  } catch (error) {
    const isTimeout = controller.signal.aborted;
    console.error("sendHinataCard error:", error);
    return {
      ok: false,
      status: 0,
      error: isTimeout ? "机台响应超时" : "机台暂时没有响应",
    };
  } finally {
    clearTimeout(timeout);
  }
}
