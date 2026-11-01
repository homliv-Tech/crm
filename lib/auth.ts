import "server-only";
import { cookies } from "next/headers";
import { validSession } from "./session";

export const SESSION_COOKIE = "crm_session";
export function sessionKey() {
  const { CRM_PASSWORD, SESSION_SECRET } = process.env;
  if (
    !CRM_PASSWORD ||
    CRM_PASSWORD.length < 12 ||
    !SESSION_SECRET ||
    SESSION_SECRET.length < 32
  )
    return "";
  return `${SESSION_SECRET}:${CRM_PASSWORD}`;
}
export async function isAuthenticated() {
  return validSession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    sessionKey(),
  );
}
