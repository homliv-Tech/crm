import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRIDGE_REQUEST,
  bridgeOperation,
  bridgeEndpoint,
  bridgeRequestSchema,
  connectionOrigin,
  trustedBridgeEvent,
} from "../lib/crm-bridge";

test("CRM connection validates both the configured origin and the exact connection window", () => {
  const peer = {} as Window;
  const attacker = {} as Window;
  assert.equal(
    trustedBridgeEvent(
      { source: peer, origin: "https://crm.example" },
      peer,
      "https://crm.example",
    ),
    true,
  );
  assert.equal(
    trustedBridgeEvent(
      { source: peer, origin: "https://evil.example" },
      peer,
      "https://crm.example",
    ),
    false,
  );
  assert.equal(
    trustedBridgeEvent(
      { source: attacker, origin: "https://crm.example" },
      peer,
      "https://crm.example",
    ),
    false,
  );
  assert.equal(
    trustedBridgeEvent(
      { source: null, origin: "https://crm.example" },
      null,
      "https://crm.example",
    ),
    false,
  );
});
test("connection configuration fails closed without breaking guest mode", () => {
  for (const value of [
    undefined,
    "",
    "bad url",
    "javascript:alert(1)",
    "https://user:secret@crm.example",
    "*",
  ])
    assert.equal(connectionOrigin(value), "");
  assert.equal(connectionOrigin("https://crm.example/"), "https://crm.example");
  assert.equal(
    connectionOrigin("http://localhost:3000"),
    "http://localhost:3000",
  );
});
test("quotation connector only forwards the three supported CRM operations", () => {
  const id = crypto.randomUUID();
  const commands = [
    bridgeOperation("/api/crm"),
    bridgeOperation(`/api/quotations?id=${id}`),
    bridgeOperation("/api/quotations", {
      method: "POST",
      body: JSON.stringify({ document: { id }, version: 2 }),
    }),
  ];
  const requests = commands.map((command) =>
    bridgeRequestSchema.parse({
      type: BRIDGE_REQUEST,
      id: crypto.randomUUID(),
      ...command,
    }),
  );
  assert.equal(bridgeEndpoint(requests[0]).path, "/api/crm");
  assert.equal(bridgeEndpoint(requests[1]).path, `/api/quotations?id=${id}`);
  const save = bridgeEndpoint(requests[2]);
  assert.equal(save.init?.method, "POST");
  assert.deepEqual(JSON.parse(save.init!.body as string), {
    document: { id },
    version: 2,
  });
  for (const path of [
    "https://evil.example/api/crm",
    "/api/admin/users",
    "/api/account/passkeys",
    "/api/quotations?id=invalid",
  ])
    assert.throws(() => bridgeOperation(path));
  assert.throws(() => bridgeOperation("/api/quotations", { method: "DELETE" }));
  assert.equal(
    bridgeRequestSchema.safeParse({
      type: BRIDGE_REQUEST,
      id,
      action: "fetch",
      path: "/api/admin/users",
    }).success,
    false,
  );
  assert.equal(
    bridgeRequestSchema.safeParse({
      type: BRIDGE_REQUEST,
      id,
      action: "save",
      version: -1,
    }).success,
    false,
  );
});
