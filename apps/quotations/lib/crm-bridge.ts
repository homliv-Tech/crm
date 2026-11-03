import { z } from "zod";

export const BRIDGE_AUTHORIZED = "homliv-crm:authorized";
export const BRIDGE_REQUEST = "homliv-crm:request";
export const bridgeRequestSchema = z.discriminatedUnion("action", [
  z.object({
    type: z.literal(BRIDGE_REQUEST),
    id: z.uuid(),
    action: z.literal("delete"),
    quotationId: z.uuid(),
  }),
  z.object({
    type: z.literal(BRIDGE_REQUEST),
    id: z.uuid(),
    action: z.literal("snapshot"),
  }),
  z.object({
    type: z.literal(BRIDGE_REQUEST),
    id: z.uuid(),
    action: z.literal("quotations"),
    companyId: z.uuid(),
    status: z.enum(["active", "Accepted", "Declined"]),
  }),
  z.object({
    type: z.literal(BRIDGE_REQUEST),
    id: z.uuid(),
    action: z.literal("quotation"),
    quotationId: z.uuid(),
  }),
  z.object({
    type: z.literal(BRIDGE_REQUEST),
    id: z.uuid(),
    action: z.literal("save"),
    document: z.unknown(),
    version: z.number().int().min(0),
  }),
]);

// Only these CRM operations may be requested by the quotation window.
export function bridgeOperation(path: string, init?: RequestInit) {
  if (path === "/api/crm" && !init?.method)
    return { action: "snapshot" as const };
  const list =
    /^\/api\/quotations\?status=(active|Accepted|Declined)&companyId=([^&]+)$/.exec(
      path,
    );
  if (list && !init?.method)
    return {
      action: "quotations" as const,
      companyId: z.uuid().parse(decodeURIComponent(list[2])),
      status: z.enum(["active", "Accepted", "Declined"]).parse(list[1]),
    };
  const match = /^\/api\/quotations\?id=([^&]+)$/.exec(path);
  if (match && init?.method === "DELETE")
    return {
      action: "delete" as const,
      quotationId: z.uuid().parse(decodeURIComponent(match[1])),
    };
  if (match && !init?.method)
    return {
      action: "quotation" as const,
      quotationId: z.uuid().parse(decodeURIComponent(match[1])),
    };
  if (
    path === "/api/quotations" &&
    init?.method === "POST" &&
    typeof init.body === "string"
  ) {
    const body = JSON.parse(init.body);
    return {
      action: "save" as const,
      document: body.document,
      version: body.version,
    };
  }
  throw new Error("Unsupported CRM operation.");
}

export function bridgeEndpoint(request: z.infer<typeof bridgeRequestSchema>): {
  path: string;
  init?: RequestInit;
} {
  switch (request.action) {
    case "snapshot":
      return { path: "/api/crm" };
    case "quotations":
      return {
        path: `/api/quotations?status=${request.status}&companyId=${encodeURIComponent(request.companyId)}`,
      };
    case "quotation":
      return {
        path: `/api/quotations?id=${encodeURIComponent(request.quotationId)}`,
      };
    case "delete":
      return {
        path: `/api/quotations?id=${encodeURIComponent(request.quotationId)}`,
        init: { method: "DELETE" },
      };
    case "save":
      return {
        path: "/api/quotations",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document: request.document,
            version: request.version,
          }),
        },
      };
  }
}

export function trustedBridgeEvent(
  event: Pick<MessageEvent, "source" | "origin">,
  peer: Window | null,
  origin: string,
) {
  return peer !== null && event.source === peer && event.origin === origin;
}

// Invalid connection settings must never prevent guest quotation editing.
export function connectionOrigin(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.origin
      : "";
  } catch {
    return "";
  }
}
