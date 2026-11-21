import assert from "node:assert/strict";
import { test } from "node:test";
import type { MouseEvent } from "react";
import {
  activateProjectLink,
  projectHref,
  projectIdFromQuery,
} from "../lib/crm/project-navigation";
import { loginDestination } from "../lib/login-destination";

const id = "ABCDEF12-3456-4789-ABCD-123456789ABC";
function click(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  let prevented = false;
  const opened: string[] = [];
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    currentTarget: { target: "", hasAttribute: () => false },
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  } as unknown as MouseEvent<HTMLAnchorElement>;
  activateProjectLink(event, id, (projectId) => opened.push(projectId));
  return { prevented, opened };
}

test("ordinary project-link activation preserves the in-place workspace behavior", () => {
  assert.deepEqual(click(), { prevented: true, opened: [id] });
});
test("modified clicks and middle-click leave native link navigation intact", () => {
  for (const overrides of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { button: 2 },
    { defaultPrevented: true },
  ])
    assert.deepEqual(click(overrides), { prevented: false, opened: [] });
  assert.deepEqual(
    click({
      currentTarget: {
        target: "_blank",
        hasAttribute: () => false,
      } as unknown as HTMLAnchorElement,
    }),
    { prevented: false, opened: [] },
  );
});
test("project URLs round-trip valid project IDs and reject invalid or ambiguous query values", () => {
  const href = projectHref(id);
  assert.equal(new URL(href, "https://crm.example").pathname, "/");
  assert.equal(
    projectIdFromQuery(
      new URL(href, "https://crm.example").searchParams.get("project"),
    ),
    id.toLowerCase(),
  );
  for (const invalid of [
    undefined,
    null,
    "bad",
    "https://evil.example",
    [id],
    `${id}&next=https://evil.example`,
  ])
    assert.equal(projectIdFromQuery(invalid), null);
});
test("sign-in preserves only validated local project destinations", () => {
  assert.equal(
    loginDestination(projectHref(id)),
    projectHref(id.toLowerCase()),
  );
  for (const invalid of [
    "/?project=bad",
    `/?project=${id}&next=https://evil.example`,
    `//evil.example/?project=${id}`,
    `/?project=${id}#other`,
    [projectHref(id)],
  ])
    assert.equal(loginDestination(invalid), "/");
});
