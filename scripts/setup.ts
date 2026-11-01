import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
const path = ".env.local";
let text = existsSync(path) ? readFileSync(path, "utf8") : "";
const values = parse(text);
function set(name: string, value: string) {
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const line = `${name}=${JSON.stringify(value)}`;
  text = pattern.test(text)
    ? text.replace(pattern, line)
    : `${text}\n${line}\n`;
}
if (!values.DATABASE_URL) set("DATABASE_URL", "");
if ((values.WORKOS_COOKIE_PASSWORD?.length ?? 0) < 32)
  set("WORKOS_COOKIE_PASSWORD", randomBytes(48).toString("base64url"));
for (const name of [
  "WORKOS_API_KEY",
  "WORKOS_CLIENT_ID",
  "WORKOS_ORGANIZATION_ID",
])
  if (!values[name]) set(name, "");
if (!values.NEXT_PUBLIC_WORKOS_REDIRECT_URI)
  set("NEXT_PUBLIC_WORKOS_REDIRECT_URI", "http://localhost:3000/callback");
writeFileSync(path, text);
chmodSync(path, 0o600);
console.log(
  "Saved .env.local with a private WorkOS cookie password. Set DATABASE_URL and your WorkOS API key, client ID, and organization ID. See README.md for WorkOS setup.",
);
