// SimpleWebAuthn wraps DOMExceptions, so inspect both its code and the cause.
export function passkeyRegistrationError(
  error: unknown,
  rpId: string | undefined,
  origin: string,
): unknown {
  let current = error;
  for (
    let depth = 0;
    depth < 3 && current && typeof current === "object";
    depth++
  ) {
    const failure = current as {
      code?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      failure.code === "ERROR_INVALID_RP_ID" ||
      failure.code === "ERROR_INVALID_DOMAIN" ||
      /(?:rp[.\s]?id|relying.party).*?(?:origin|domain|invalid)|(?:origin|domain).*?(?:rp[.\s]?id|relying.party)/i.test(
        failure.message ?? "",
      )
    ) {
      return new Error(
        `WorkOS requested a passkey for ${rpId || "its sign-in domain"}, but this page is on ${origin}. This browser cannot create that passkey here. Enrollment must run on a domain supported by WorkOS's passkey configuration; enabling passkeys or adding a CORS origin alone will not fix this. You can still sign in with an email code.`,
      );
    }
    current = failure.cause;
  }
  return error;
}
