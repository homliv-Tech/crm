import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export function equalSecrets(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function signSession(key: string, expires = Date.now() + 8 * 3600000) {
  const payload = String(expires);
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}
export function validSession(
  token: string | undefined,
  key: string,
  now = Date.now(),
) {
  if (!token || !key) return false;
  const [expires, signature, extra] = token.split(".");
  if (
    extra ||
    !signature ||
    !/^\d+$/.test(expires) ||
    Number(expires) <= now ||
    Number(expires) > now + 8 * 3600000
  )
    return false;
  return equalSecrets(token, signSession(key, Number(expires)));
}
