// Shared-password authentication has been retired. Old CRM cookies grant no access.
export async function POST() {
  return Response.json(
    { error: "Sign in with an email verification code at /login." },
    { status: 410 },
  );
}
