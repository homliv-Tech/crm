"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCompaniesStore } from "@/stores/companies-store";
import { Input } from "@/components/_ui/input";
import Button from "@/components/_ui/button";
export default function LoginForm({
  invitationToken,
  destination = "/",
}: {
  invitationToken?: string;
  destination?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(action: "send" | "verify") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email: email.trim(),
          ...(action === "verify" ? { code } : {}),
          ...(invitationToken ? { invitationToken } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "verify") {
        // Clear any previous user's in-memory CRM data before entering.
        useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
        router.replace(destination);
        router.refresh();
      } else {
        setCode("");
        setStep("code");
        setMessage(
          "If this email has workspace access or a valid invitation, a six-digit code is on its way. Check your spam folder too.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not sign in. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(step === "email" ? "send" : "verify");
  }
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {invitationToken && (
        <p className="text-subtle text-sm">
          Use the email address that received your invitation to join the
          workspace.
        </p>
      )}
      <label className="block text-sm" htmlFor="login-email">
        Work email
        <Input
          id="login-email"
          type="email"
          name="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={step === "code"}
          disabled={busy}
          className="mt-2"
        />
      </label>
      {step === "code" && (
        <label className="block text-sm" htmlFor="login-code">
          Verification code
          <Input
            id="login-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            disabled={busy}
            aria-describedby="code-help"
            className="mt-2 text-center tracking-[0.4em] tabular-nums"
          />
          <span id="code-help" className="text-subtle mt-2 block text-xs">
            Enter the code from your email. It expires in 10 minutes.
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <p role="status" className="text-subtle text-sm">
        {message}
      </p>
      <Button
        type="submit"
        variant="primary"
        disabled={busy}
        className="h-10 w-full"
      >
        {busy
          ? step === "email"
            ? "Sending code…"
            : "Signing in…"
          : step === "email"
            ? "Send verification code"
            : "Sign in"}
      </Button>
      {step === "code" && (
        <div className="flex justify-between gap-3">
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
              setMessage("");
            }}
          >
            Use another email
          </Button>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => void submit("send")}
          >
            Resend code
          </Button>
        </div>
      )}
    </form>
  );
}
