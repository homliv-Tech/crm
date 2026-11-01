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
if ((values.CRM_PASSWORD?.length ?? 0) < 12)
  set("CRM_PASSWORD", randomBytes(20).toString("base64url"));
if ((values.SESSION_SECRET?.length ?? 0) < 32)
  set("SESSION_SECRET", randomBytes(48).toString("base64url"));
writeFileSync(path, text);
chmodSync(path, 0o600);
console.log(
  "Workspace credentials are saved in .env.local. Set DATABASE_URL to your writable Neon connection string. Use CRM_PASSWORD to sign in; keep this file private.",
);
