import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionKey } from "@/lib/auth";
import { equalSecrets, signSession } from "@/lib/session";

// A global cap per process avoids trusting spoofable client IP headers.
const attempts: number[] = [];
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const key = sessionKey();
  if (!key)
    return Response.json(
      {
        error:
          "Set CRM_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) in your server environment.",
      },
      { status: 503 },
    );
  const now = Date.now();
  while (attempts.length && attempts[0] < now - 60000) attempts.shift();
  if (attempts.length >= 10)
    return Response.json(
      { error: "Too many attempts. Try again in a minute." },
      { status: 429 },
    );
  attempts.push(now);
  let password: unknown;
  try {
    password = (await request.json()).password;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    typeof password !== "string" ||
    password.length > 1000 ||
    !equalSecrets(password, process.env.CRM_PASSWORD!)
  )
    return Response.json(
      { error: "Incorrect workspace password." },
      { status: 401 },
    );
  (await cookies()).set(SESSION_COOKIE, signSession(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 3600,
  });
  return Response.json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
