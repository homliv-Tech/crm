"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { passkeyRegistrationError } from "@/lib/passkey-errors";
import type { Passkey } from "@/lib/passkey-handlers";

type Proof = { elevatedAccessToken: string; expiresAt: string };
async function request<T>(body?: object): Promise<T> {
  const response = await fetch(
    "/api/account/passkeys",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error ?? "Could not update passkeys.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return result;
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not used yet";
}
export default function PasskeySettings({ email }: { email: string }) {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(
    () => request<{ passkeys: Passkey[] }>().then((data) => data.passkeys),
    [],
  );
  useEffect(() => {
    void load()
      .then(setPasskeys)
      .catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!proof) return;
    const timeout = setTimeout(
      () => {
        setProof(null);
        setMessage(
          "Email verification expired. Verify again to change passkeys.",
        );
      },
      Math.max(0, new Date(proof.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [proof]);
  const verified = proof !== null;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if ((e as { status?: number }).status === 403) setProof(null);
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Passkey creation was canceled or timed out. You can try again."
          : name === "InvalidStateError"
            ? "This device already has this passkey. Try another authenticator."
            : name === "SecurityError"
              ? "This browser cannot register a passkey for the configured sign-in domain. Contact your administrator."
              : e instanceof Error
                ? e.message
                : "Could not update passkeys.",
      );
    } finally {
      setBusy(false);
    }
  }
  function freshProof() {
    if (!proof || new Date(proof.expiresAt).getTime() <= Date.now()) {
      setProof(null);
      throw new Error("Verify your email again before changing passkeys.");
    }
    return proof.elevatedAccessToken;
  }
  function sendCode() {
    void run(async () => {
      setProof(null);
      const result = await request<{ authenticationChallengeId: string }>({
        action: "send-verification",
      });
      setChallengeId(result.authenticationChallengeId);
      setCode("");
      setMessage(`A verification code was sent to ${email}.`);
    });
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const result = await request<Proof>({
        action: "verify-email",
        authenticationChallengeId: challengeId,
        code,
      });
      setProof(result);
      setCode("");
      setChallengeId("");
      setMessage("Email verified. You can now add or remove passkeys.");
    });
  }
  function add() {
    void run(async () => {
      if (!window.isSecureContext || !browserSupportsWebAuthn())
        throw new Error(
          "Passkeys require a supported browser and a secure connection. You can still sign in with an email code.",
        );
      const elevatedAccessToken = freshProof();
      const result = await request<{
        challengeId: string;
        options: PublicKeyCredentialCreationOptionsJSON;
      }>({ action: "register", elevatedAccessToken });
      let response;
      try {
        response = await startRegistration({ optionsJSON: result.options });
      } catch (error) {
        throw passkeyRegistrationError(
          error,
          result.options.rp.id,
          window.location.origin,
        );
      }
      await request({
        action: "finish-registration",
        elevatedAccessToken,
        challengeId: result.challengeId,
        response,
      });
      setMessage(
        "Passkey added. You can use it with the passkey option on the login screen.",
      );
      try {
        setPasskeys(await load());
      } catch {
        setError(
          "Passkey added, but the list could not refresh. Reload to see it.",
        );
      }
    });
  }
  function remove() {
    if (!removeTarget) return;
    void run(async () => {
      await request({
        action: "delete",
        elevatedAccessToken: freshProof(),
        passkeyId: removeTarget,
      });
      setRemoveTarget(null);
      setMessage("Passkey removed. You can still sign in with an email code.");
      try {
        setPasskeys(await load());
      } catch {
        setError(
          "Passkey removed, but the list could not refresh. Reload to see the change.",
        );
      }
    });
  }
  return (
    <div className="space-y-6">
      <section
        className="border-border rounded-xl border p-5"
        aria-labelledby="verification-title"
      >
        <h2 id="verification-title" className="text-lg">
          Verify your identity
        </h2>
        <p className="text-subtle mt-2 mb-4 text-sm">
          For your security, verify {email} before adding or removing passkeys.
        </p>
        {verified ? (
          <p className="text-sm">Your email is verified for a short time.</p>
        ) : challengeId ? (
          <form onSubmit={verify} className="flex flex-wrap items-end gap-3">
            <label className="text-sm" htmlFor="security-code">
              Email verification code
              <Input
                id="security-code"
                name="code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                disabled={busy}
                className="mt-2"
              />
            </label>
            <Button type="submit" disabled={busy}>
              Verify code
            </Button>
            <Button onClick={sendCode} disabled={busy}>
              Resend code
            </Button>
          </form>
        ) : (
          <Button onClick={sendCode} disabled={busy}>
            Send verification code
          </Button>
        )}
      </section>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <p role="status" className="text-subtle text-sm">
        {busy ? "Working…" : message}
      </p>
      <section aria-labelledby="passkeys-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="passkeys-title" className="text-lg">
            Your passkeys
          </h2>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => void run(async () => setPasskeys(await load()))}
            >
              Reload
            </Button>
            <Button
              variant="primary"
              onClick={add}
              disabled={busy || !verified}
            >
              Add passkey
            </Button>
          </div>
        </div>
        <p className="text-subtle mb-4 text-sm">
          Use your device’s fingerprint, face recognition, PIN, or a security
          key. Your email-code sign-in remains available if you lose a device.
        </p>
        {passkeys === null ? (
          <p role="status" className="text-sm">
            {error
              ? "Passkeys could not be loaded. Use Reload to try again."
              : "Loading passkeys…"}
          </p>
        ) : !passkeys.length ? (
          <p className="text-subtle border-border rounded-xl border p-5 text-sm">
            You haven’t registered a passkey yet. Verify your email above, then
            choose Add passkey.
          </p>
        ) : (
          <ul className="space-y-3">
            {passkeys.map((passkey, index) => (
              <li
                key={passkey.id}
                className="border-border rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Passkey {index + 1}</h3>
                    <p className="text-subtle mt-2 text-xs">
                      Added {date(passkey.createdAt)}
                    </p>
                    <p className="text-subtle mt-1 text-xs">
                      Last used: {date(passkey.lastVerifiedAt)}
                    </p>
                  </div>
                  <Button
                    disabled={busy || !verified}
                    onClick={() => setRemoveTarget(passkey.id)}
                    aria-label={`Remove passkey ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>
                {removeTarget === passkey.id && (
                  <div className="border-border mt-4 border-t pt-4">
                    <p className="mb-3 text-sm">
                      Remove this passkey? It will no longer work for sign-in.
                      This does not remove it from your device’s password
                      manager.
                    </p>
                    <div className="flex gap-2">
                      <Button disabled={busy} onClick={remove}>
                        Confirm removal
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => setRemoveTarget(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
