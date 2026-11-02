export function authConfigured() {
  return Boolean(
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID &&
    process.env.WORKOS_ORGANIZATION_ID &&
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI &&
    (process.env.WORKOS_COOKIE_PASSWORD?.length ?? 0) >= 32,
  );
}
