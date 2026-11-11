export interface TurnstileResult {
  ok: boolean;
  reason?: string;
}

export async function verifyTurnstile(
  secretKey: string,
  token: string,
  remoteIp?: string,
  fetchFn: typeof fetch = fetch,
): Promise<TurnstileResult> {
  // Fail closed when secret key is not configured
  if (!secretKey) {
    return { ok: false, reason: "Turnstile verification is not configured on the server." };
  }
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "Missing verification token." };
  }

  try {
    const form = new URLSearchParams();
    form.set("secret", secretKey);
    form.set("response", token);
    if (remoteIp) form.set("remoteip", remoteIp);

    const res = await fetchFn(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      return { ok: false, reason: `Turnstile upstream HTTP ${res.status}` };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success === true) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Turnstile verification failed (${(data["error-codes"] ?? []).join(", ") || "rejected"})`,
    };
  } catch (err) {
    return { ok: false, reason: `Turnstile check error: ${String(err)}` };
  }
}
