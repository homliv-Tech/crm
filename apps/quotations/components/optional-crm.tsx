"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  connectionOrigin,
  BRIDGE_AUTHORIZED,
  BRIDGE_REQUEST,
  bridgeOperation,
  trustedBridgeEvent,
} from "../lib/crm-bridge";
import CrmConnection from "./crm-connection";
import Button from "./button";

type Props = Omit<
  ComponentProps<typeof CrmConnection>,
  "external" | "request"
> & { crmUrl?: string; signInHref?: string };

export default function OptionalCrm({ crmUrl, signInHref, ...props }: Props) {
  const popup = useRef<Window | null>(null);
  const connectionEpoch = useRef(0);

  const [connected, setConnected] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("");
  const origin = connectionOrigin(crmUrl);

  useEffect(() => {
    if (!origin || signInHref) return;
    let active = true;
    let exchanging = false;
    const restoreEpoch = connectionEpoch.current;
    fetch("/api/crm/connection", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (
          active &&
          restoreEpoch === connectionEpoch.current &&
          response.ok &&
          data.connected
        )
          setConnected(true);
      })
      .catch(() => {});
    async function receive(event: MessageEvent) {
      if (
        !trustedBridgeEvent(event, popup.current, origin) ||
        event.data?.type !== BRIDGE_AUTHORIZED ||
        typeof event.data.code !== "string" ||
        exchanging
      )
        return;
      exchanging = true;
      try {
        const response = await fetch("/api/crm/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: event.data.code }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not complete sign-in.");
        if (!active) return;
        connectionEpoch.current++;
        setConnected(true);
        setOpening(false);
        setMessage("");
        popup.current?.close();
        popup.current = null;
      } catch (error) {
        if (active) {
          popup.current?.close();
          popup.current = null;
          setOpening(false);
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not connect. Try again.",
          );
        }
      } finally {
        exchanging = false;
      }
    }
    // Closing the sign-in window never ends an established connection.
    const checkClosed = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setOpening(false);
      }
    }, 1000);
    window.addEventListener("message", receive);
    return () => {
      active = false;
      window.removeEventListener("message", receive);
      clearInterval(checkClosed);
      popup.current?.close();
      popup.current = null;
    };
  }, [origin, signInHref]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const operation = bridgeOperation(path, init);
    const response = await fetch("/api/crm/operation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: BRIDGE_REQUEST,
        id: crypto.randomUUID(),
        ...operation,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || data.connectionEnded === true) {
        setConnected(false);
        setMessage(
          "Your CRM connection has ended. Sign in again to reconnect.",
        );
      }
      throw new Error(data.error || "CRM request failed.");
    }
    return data;
  }, []);

  function connect() {
    if (!origin) return;
    if (popup.current && !popup.current.closed) {
      popup.current.focus();
      return;
    }
    popup.current = window.open(
      "/api/crm/connect",
      `homliv-crm-${crypto.randomUUID()}`,
      "popup,width=520,height=720",
    );
    if (!popup.current) {
      setMessage(
        "Allow pop-ups for this site to sign in with Homliv CRM. You can keep using the quotation maker without signing in.",
      );
      return;
    }
    setOpening(true);
    setMessage(
      "Finish signing in in the Homliv CRM window. Your quotation stays here.",
    );
  }
  async function disconnect() {
    try {
      const response = await fetch("/api/crm/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect. Try again.");
      const data = await response.json();
      connectionEpoch.current++;
      setConnected(false);
      setOpening(false);
      setMessage(
        data.revoked
          ? "CRM disconnected. Your quotation stays saved in this browser."
          : "Disconnected in this browser. CRM could not be reached to revoke the connection; it will expire automatically.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not disconnect.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <section aria-label="Homliv CRM sign-in" className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${connected ? "bg-emerald-600" : "bg-stone-300"}`}
          />
          <h2 className="text-sm font-medium">
            {connected ? "CRM connected" : "Connect Homliv CRM"}
          </h2>
        </div>
        {!connected && (
          <p className="text-xs text-stone-600">
            Prefill client details and save quotations to your CRM.
          </p>
        )}
        {connected ? (
          <Button
            variant="secondary"
            className="w-full text-xs whitespace-normal"
            onClick={() => void disconnect()}
          >
            Disconnect CRM
          </Button>
        ) : (
          <div className="space-y-2">
            {signInHref ? (
              <Link
                href={signInHref}
                className="flex min-h-10 items-center justify-center rounded-lg bg-emerald-800 px-3 py-2 text-center text-xs font-medium text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                Sign in with Homliv CRM
              </Link>
            ) : (
              <Button
                variant="primary"
                className="w-full text-xs whitespace-normal"
                onClick={connect}
                disabled={!origin}
              >
                {opening ? "Continue sign-in" : "Sign in with Homliv CRM"}
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-xs whitespace-normal"
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                const editor = document.getElementById("editor");
                editor?.scrollIntoView({ behavior: "instant" });
                editor?.focus({ preventScroll: true });
              }}
            >
              Continue without signing in
            </Button>
          </div>
        )}
        {!origin && !signInHref && (
          <p className="text-xs text-stone-600">
            CRM connection is not configured. You can still create quotations
            without signing in.
          </p>
        )}
        {message && (
          <p role="status" className="text-xs break-words text-stone-600">
            {message}
          </p>
        )}
      </section>
      {connected && <CrmConnection {...props} external request={request} />}
    </div>
  );
}
