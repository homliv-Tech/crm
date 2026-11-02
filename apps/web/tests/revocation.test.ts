import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { useCompaniesStore } from "../stores/companies-store";
import { COMPANIES } from "../data/companies";
import { createExportHandler } from "../lib/crm/export-handler";

const originalFetch = globalThis.fetch;
const snapshot = {
  companies: COMPANIES.slice(0, 2).map((company) => ({
    ...company,
    website: "",
    description: "",
  })),
  contacts: [],
  deals: [],
  tasks: [],
  activities: [],
};
function seed() {
  useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
  useCompaniesStore.setState({
    ...snapshot,
    accessState: "allowed",
    canWrite: true,
    loading: false,
    detailId: snapshot.companies[0].id,
    detailOpen: true,
    profileName: "Owner",
    profileOpen: true,
    newCompanyOpen: true,
    selectedIds: [snapshot.companies[0].id],
    searchOpen: true,
  });
}
function assertCleared() {
  const state = useCompaniesStore.getState();
  for (const key of [
    "companies",
    "contacts",
    "deals",
    "tasks",
    "activities",
    "selectedIds",
  ] as const)
    assert.deepEqual(state[key], []);
  for (const key of [
    "canWrite",
    "detailOpen",
    "profileOpen",
    "newCompanyOpen",
    "searchOpen",
  ] as const)
    assert.equal(state[key], false);
  assert.equal(state.detailId, null);
  assert.equal(state.profileName, null);
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
});
test("revoked active tabs clear cached records, selections, details, and export access", async () => {
  for (const status of [401, 403]) {
    seed();
    globalThis.fetch = async () =>
      Response.json({ error: "Access revoked." }, { status });
    assert.equal(await useCompaniesStore.getState().checkAccess(), false);
    assert.equal(useCompaniesStore.getState().accessState, "denied");
    assertCleared();
    assert.equal(await useCompaniesStore.getState().exportCompanies(), null);
  }
});
test("access-check failures also hide and clear workspace data", async () => {
  for (const failure of ["offline", "provider"] as const) {
    seed();
    globalThis.fetch = async () => {
      if (failure === "offline") throw new Error("offline");
      return Response.json({}, { status: 503 });
    };
    assert.equal(await useCompaniesStore.getState().checkAccess(true), false);
    assert.equal(useCompaniesStore.getState().accessState, "unavailable");
    assertCleared();
  }
});
test("rejected writes check whether read access was revoked and clear cached data", async () => {
  seed();
  const paths: string[] = [];
  globalThis.fetch = async (url) => {
    paths.push(String(url));
    return Response.json({ error: "Access revoked." }, { status: 403 });
  };
  assert.equal(
    await useCompaniesStore.getState().mutate("companies", "PATCH", {}),
    false,
  );
  assert.deepEqual(paths, ["/api/crm/companies", "/api/auth/access"]);
  assert.equal(useCompaniesStore.getState().accessState, "denied");
  assertCleared();
});
test("a viewer demotion keeps valid read access while disabling writes", async () => {
  seed();
  globalThis.fetch = async (url) =>
    String(url).includes("/api/crm/")
      ? Response.json({ error: "Read only." }, { status: 403 })
      : Response.json({ role: "viewer" });
  assert.equal(
    await useCompaniesStore.getState().mutate("companies", "PATCH", {}),
    false,
  );
  assert.equal(useCompaniesStore.getState().accessState, "allowed");
  assert.equal(useCompaniesStore.getState().canWrite, false);
  assert.equal(useCompaniesStore.getState().companies.length, 2);
});
test("an older successful data response cannot restore records after revocation", async () => {
  seed();
  let finish!: (response: Response) => void;
  globalThis.fetch = (url) =>
    String(url) === "/api/crm"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(Response.json({}, { status: 403 }));
  const refreshing = useCompaniesStore.getState().refresh();
  await useCompaniesStore.getState().checkAccess();
  finish(Response.json({ ...snapshot, role: "member" }));
  await refreshing;
  assert.equal(useCompaniesStore.getState().accessState, "denied");
  assertCleared();
});
test("exports always call the server and rejected export responses clear the workspace", async () => {
  seed();
  const paths: string[] = [];
  globalThis.fetch = async (url, options) => {
    paths.push(String(url));
    assert.equal(options?.method, "POST");
    const body = JSON.parse(String(options?.body));
    assert.ok(!("companies" in body));
    return Response.json({ error: "Access revoked." }, { status: 403 });
  };
  assert.equal(await useCompaniesStore.getState().exportCompanies(), null);
  assert.deepEqual(paths, ["/api/crm/export"]);
  assertCleared();
});
test("an export started before revocation cannot download after access is removed", async () => {
  seed();
  let finish!: (response: Response) => void;
  globalThis.fetch = (url) =>
    String(url) === "/api/crm/export"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(Response.json({}, { status: 403 }));
  const exporting = useCompaniesStore.getState().exportCompanies();
  await useCompaniesStore.getState().checkAccess();
  finish(new Response("cached confidential rows"));
  assert.equal(await exporting, null);
  assertCleared();
});
test("revoked sessions cannot reach the export database query", async () => {
  for (const status of [401, 403, 503]) {
    let queried = false;
    const handler = createExportHandler({
      authorize: async () => Response.json({}, { status }),
      getSnapshot: async () => {
        queried = true;
        return snapshot;
      },
    });
    const response = await handler(
      new Request("https://crm.example/api/crm/export", {
        method: "POST",
        headers: { origin: "https://crm.example" },
        body: "{}",
      }),
    );
    assert.equal(response.status, status);
    assert.equal(queried, false);
  }
});
test("authorized exports use fresh server records, preserve filters, and prevent foreign-origin requests", async () => {
  let reads = 0;
  const handler = createExportHandler({
    authorize: async () => ({}),
    getSnapshot: async () => {
      reads++;
      return snapshot;
    },
  });
  const owner = snapshot.companies[0].owner;
  const response = await handler(
    new Request("https://crm.example/api/crm/export", {
      method: "POST",
      headers: { origin: "https://crm.example" },
      body: JSON.stringify({
        owner,
        companies: [{ name: "browser-injected-record" }],
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/csv/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const csv = await response.text();
  assert.ok(csv.includes(snapshot.companies[0].name));
  assert.ok(!csv.includes("browser-injected-record"));
  const denied = await handler(
    new Request("https://crm.example/api/crm/export", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: "{}",
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(reads, 1);
});
