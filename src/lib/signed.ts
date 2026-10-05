import crypto from "node:crypto";
import { getSecret } from "./session";

/** Pequenos valores assinados (HMAC) com validade, para cookies curtos como o do fluxo OIDC. */
export function signPayload(data: object, ttlSeconds: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(now / 1000) + ttlSeconds })).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(`signed:${body}`).digest("base64url");
  return `${body}.${signature}`;
}

export function readPayload<T extends object>(token: string | undefined, now = Date.now()): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const expected = Buffer.from(crypto.createHmac("sha256", getSecret()).update(`signed:${body}`).digest("base64url"));
  const received = Buffer.from(token.slice(dot + 1));
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
