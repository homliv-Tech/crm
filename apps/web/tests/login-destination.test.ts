import assert from "node:assert/strict";
import { test } from "node:test";
import { loginDestination } from "../lib/login-destination";

test("sign-in returns to the quotation maker or connection without accepting arbitrary redirects", () => {
  for (const path of [
    "/quotations",
    "/quotations/connect",
    `/quotations/connect?challenge=${"a".repeat(43)}`,
  ])
    assert.equal(loginDestination(path), path);
  for (const path of [
    undefined,
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/admin",
    "/quotations/connect?challenge=bad",
    `/quotations/connect?challenge=${"a".repeat(43)}&next=https://evil.example`,
    "/quotations?next=https://evil.example",
    ["/quotations"],
  ])
    assert.equal(loginDestination(path), "/");
});
