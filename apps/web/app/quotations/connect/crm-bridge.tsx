"use client";

import { useEffect, useRef, useState } from "react";
import { BRIDGE_AUTHORIZED } from "@crm/quotations/crm-bridge";

export default function CrmBridge({
  quotationOrigin,
  email,
  challenge,
}: {
  quotationOrigin: string;
  email: string;
  challenge: string;
}) {
  const [status, setStatus] = useState("Completing your connection…");
  const issued = useRef<Promise<string> | null>(null);
  useEffect(() => {
    const peer = window.opener as Window | null;
    if (!peer || !quotationOrigin || !challenge) {
      queueMicrotask(() =>
        setStatus(
          "Return to the quotation maker and select Sign in with Homliv CRM to connect.",
        ),
      );
      return;
    }
    let active = true;
    issued.current ??= fetch("/api/quotation-connection/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not complete sign-in.");
      return data.code as string;
    });
    issued.current
      .then((code) => {
        if (!active) return;
        peer.postMessage({ type: BRIDGE_AUTHORIZED, code }, quotationOrigin);
        setStatus(
          "Sign-in complete. This window will close automatically once your quotation maker connects.",
        );
      })
      .catch((error) => {
        if (active)
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not connect. Try signing in again.",
          );
      });
    return () => {
      active = false;
    };
  }, [quotationOrigin, challenge]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl">Homliv CRM</h1>
      <p className="text-sm">Signed in as {email}</p>
      <p role="status" className="text-sm">
        {status}
      </p>
    </main>
  );
}
