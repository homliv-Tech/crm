import { test } from "node:test";
import assert from "node:assert/strict";
import { passkeyRegistrationError } from "../lib/passkey-errors";

test("domain rejection explains the actual WorkOS relying party and CRM origin", () => {
  for (const failure of [
    new Error("'rp.id' cannot be used with the current origin"),
    { code: "ERROR_INVALID_RP_ID", message: "Invalid RP" },
    {
      name: "WebAuthnError",
      cause: { message: "The RP ID is invalid for this domain" },
    },
  ]) {
    const result = passkeyRegistrationError(
      failure,
      "example.authkit.app",
      "http://localhost:3000",
    );
    assert.ok(result instanceof Error);
    assert.match(result.message, /example.authkit.app/);
    assert.match(result.message, /http:\/\/localhost:3000/);
    assert.match(result.message, /CORS origin alone will not fix this/);
    assert.match(result.message, /email code/);
  }
});
test("cancellation and duplicate credential errors retain their original handling", () => {
  for (const failure of [
    new DOMException("Canceled", "NotAllowedError"),
    new DOMException("Already registered", "InvalidStateError"),
    new Error("Network unavailable"),
  ]) {
    assert.equal(
      passkeyRegistrationError(
        failure,
        "example.com",
        "https://crm.example.com",
      ),
      failure,
    );
  }
});
