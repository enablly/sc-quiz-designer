import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_COOKIE_NAME = "sc_admin_session";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function computeSessionDigest(adminToken: string): string {
  return crypto
    .createHmac("sha256", adminToken)
    .update("sc-quiz-designer-admin-session-v1")
    .digest("hex");
}

export function isAdminAuthenticated(req: Request, adminToken: string): boolean {
  if (!adminToken) return false;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (safeEqual(token, adminToken)) return true;
  }

  const headerToken = req.headers["x-admin-token"];
  if (typeof headerToken === "string" && safeEqual(headerToken.trim(), adminToken)) {
    return true;
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieVal = cookies[ADMIN_COOKIE_NAME];
  if (cookieVal && safeEqual(cookieVal, computeSessionDigest(adminToken))) {
    return true;
  }

  return false;
}

export function requireAdminAuth(adminToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isAdminAuthenticated(req, adminToken)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

export function setAdminSessionCookie(req: Request, res: Response, adminToken: string): void {
  const digest = computeSessionDigest(adminToken);
  const isHttps =
    req.secure ||
    String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
  const attrs = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(digest)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=43200",
    ...(isHttps ? ["Secure"] : []),
  ];
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function clearAdminSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
