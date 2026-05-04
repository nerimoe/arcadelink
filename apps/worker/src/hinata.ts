export type HinataResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export async function sendHinataCard(targetUrl: string, accessCode: string): Promise<HinataResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 10_000);
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "aime", value: accessCode }),
      signal: controller.signal,
    });
    if (response.ok) return { ok: true, status: response.status };
    return { ok: false, status: response.status, error: "机台暂时没有响应" };
  } catch (error) {
    return { ok: false, status: 0, error: "机台暂时没有响应" };
  } finally {
    clearTimeout(timeout);
  }
}
