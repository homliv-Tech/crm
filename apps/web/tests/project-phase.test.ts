import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { toast } from "@crm/notifications/toast";
import { COMPANIES } from "../data/companies";
import { useCompaniesStore } from "../stores/companies-store";
import type { Deal } from "../lib/crm/types";
const originalFetch = globalThis.fetch;
const project: Deal = {
  id: crypto.randomUUID(),
  companyId: COMPANIES[0].id,
  title: "Home",
  stage: "Briefing",
  value: "100000.00",
  probability: 25,
  owner: "Architect",
  closeDate: null,
  siteAddress: "",
  brief: "",
};
function seed() {
  useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
  useCompaniesStore.setState({
    accessState: "allowed",
    canWrite: true,
    loading: false,
    deals: [project],
    companies: [
      {
        ...COMPANIES[0],
        website: "",
        description: "",
        openDeals: 1,
        pipelineValue: 100000,
        winProbability: 25,
      },
    ],
  });
  mock.method(toast, "success", () => "test");
  mock.method(toast, "error", () => "test");
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
  useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
});
test("phase changes appear immediately and save without reloading the CRM", async () => {
  seed();
  const request = deferred();
  const calls: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, JSON.parse(String(init?.body))]);
    return request.promise;
  };
  const save = useCompaniesStore
    .getState()
    .changeProjectPhase(project.id, "Handover");
  const state = useCompaniesStore.getState();
  assert.equal(state.deals[0].stage, "Handover");
  assert.equal(state.companies[0].pipelineValue, 0);
  assert.equal(state.projectPhaseSaves[project.id], "Handover");
  assert.equal(state.saving, false);
  assert.equal(await state.changeProjectPhase(project.id, "Cancelled"), false);
  request.resolve(Response.json({ ok: true }));
  assert.equal(await save, true);
  assert.deepEqual(useCompaniesStore.getState().projectPhaseSaves, {});
  assert.deepEqual(calls, [
    [
      "/api/crm/deals",
      {
        action: "changePhase",
        id: project.id,
        stage: "Handover",
        expectedStage: "Briefing",
      },
    ],
  ]);
});
test("failed phase saves restore the phase and totals without reverting other fields", async () => {
  seed();
  const request = deferred();
  globalThis.fetch = async () => request.promise;
  const save = useCompaniesStore
    .getState()
    .changeProjectPhase(project.id, "Cancelled");
  useCompaniesStore.setState((s) => ({
    deals: s.deals.map((p) => ({ ...p, title: "Updated title" })),
  }));
  request.resolve(
    Response.json({ error: "Database unavailable" }, { status: 503 }),
  );
  assert.equal(await save, false);
  const state = useCompaniesStore.getState();
  assert.equal(state.deals[0].stage, "Briefing");
  assert.equal(state.deals[0].title, "Updated title");
  assert.equal(state.companies[0].pipelineValue, 100000);
  assert.deepEqual(state.projectPhaseSaves, {});
});
test("different projects can save independently and failures only roll back their own phase", async () => {
  seed();
  const sibling = { ...project, id: crypto.randomUUID(), title: "Office" };
  useCompaniesStore.setState({ deals: [project, sibling] });
  const first = deferred(),
    second = deferred();
  globalThis.fetch = async (_url, init) =>
    JSON.parse(String(init?.body)).id === project.id
      ? first.promise
      : second.promise;
  const failed = useCompaniesStore
    .getState()
    .changeProjectPhase(project.id, "Construction");
  const saved = useCompaniesStore
    .getState()
    .changeProjectPhase(sibling.id, "Handover");
  second.resolve(Response.json({ ok: true }));
  assert.equal(await saved, true);
  first.resolve(Response.json({}, { status: 503 }));
  assert.equal(await failed, false);
  assert.deepEqual(
    useCompaniesStore.getState().deals.map((p) => p.stage),
    ["Briefing", "Handover"],
  );
});
test("revoked access clears pending moves and late responses cannot restore records", async () => {
  seed();
  const request = deferred();
  globalThis.fetch = async () => request.promise;
  const save = useCompaniesStore
    .getState()
    .changeProjectPhase(project.id, "Construction");
  useCompaniesStore.getState().blockAccess("denied", "Access revoked");
  request.resolve(Response.json({}, { status: 503 }));
  assert.equal(await save, false);
  assert.deepEqual(useCompaniesStore.getState().deals, []);
  assert.deepEqual(useCompaniesStore.getState().projectPhaseSaves, {});
});
test("old snapshots cannot undo pending or acknowledged phase changes", async () => {
  for (const confirmFirst of [false, true]) {
    seed();
    const snapshot = deferred(),
      mutation = deferred();
    const deals = [...useCompaniesStore.getState().deals],
      companies = [...useCompaniesStore.getState().companies];
    globalThis.fetch = async (url) =>
      String(url) === "/api/crm" ? snapshot.promise : mutation.promise;
    const refresh = useCompaniesStore.getState().refresh();
    const save = useCompaniesStore
      .getState()
      .changeProjectPhase(project.id, "Construction");
    if (confirmFirst) {
      mutation.resolve(Response.json({ ok: true }));
      await save;
    }
    snapshot.resolve(Response.json({ deals, companies, role: "member" }));
    await refresh;
    assert.equal(useCompaniesStore.getState().deals[0].stage, "Construction");
    if (!confirmFirst) {
      mutation.resolve(Response.json({ ok: true }));
      await save;
    }
    mock.restoreAll();
  }
});
test("read-only, missing and unchanged projects do not send phase writes", async () => {
  seed();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({});
  };
  assert.equal(
    await useCompaniesStore
      .getState()
      .changeProjectPhase(project.id, "Briefing"),
    true,
  );
  assert.equal(
    await useCompaniesStore
      .getState()
      .changeProjectPhase("missing", "Construction"),
    false,
  );
  useCompaniesStore.setState({ canWrite: false });
  assert.equal(
    await useCompaniesStore
      .getState()
      .changeProjectPhase(project.id, "Construction"),
    false,
  );
  assert.equal(calls, 0);
});

test("a conflicting phase save reloads the current server phase after clearing the optimistic move", async () => {
  seed();
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return String(url) === "/api/crm/deals"
      ? Response.json({ error: "Phase changed elsewhere" }, { status: 409 })
      : Response.json({
          deals: [{ ...project, stage: "Construction" }],
          companies: useCompaniesStore.getState().companies,
          role: "member",
        });
  };
  assert.equal(
    await useCompaniesStore
      .getState()
      .changeProjectPhase(project.id, "Handover"),
    false,
  );
  assert.equal(useCompaniesStore.getState().deals[0].stage, "Construction");
  assert.deepEqual(useCompaniesStore.getState().projectPhaseSaves, {});
  assert.deepEqual(requests, ["/api/crm/deals", "/api/crm"]);
});

test("phase reconciliation preserves only the changed project and accepts other projects' newer phases", async () => {
  for (const outcome of ["pending", "saved", "failed"] as const) {
    seed();
    const sibling = {
      ...project,
      id: crypto.randomUUID(),
      title: "Office",
      value: "200000.00",
    };
    useCompaniesStore.setState({ deals: [project, sibling] });
    const snapshot = deferred(),
      mutation = deferred();
    const companies = useCompaniesStore.getState().companies;
    globalThis.fetch = async (url) =>
      String(url) === "/api/crm" ? snapshot.promise : mutation.promise;
    const refresh = useCompaniesStore.getState().refresh();
    const save = useCompaniesStore
      .getState()
      .changeProjectPhase(project.id, "Construction");
    if (outcome !== "pending") {
      mutation.resolve(
        Response.json(
          { ok: outcome === "saved" },
          { status: outcome === "saved" ? 200 : 503 },
        ),
      );
      await save;
    }
    snapshot.resolve(
      Response.json({
        deals: [
          { ...project, title: "New server title" },
          { ...sibling, stage: "Handover" },
        ],
        companies,
        role: "member",
      }),
    );
    await refresh;
    const state = useCompaniesStore.getState();
    assert.equal(
      state.deals[0].stage,
      outcome === "failed" ? "Briefing" : "Construction",
    );
    assert.equal(state.deals[0].title, "New server title");
    assert.equal(state.deals[1].stage, "Handover");
    assert.equal(state.companies[0].openDeals, 1);
    assert.equal(state.companies[0].pipelineValue, 100000);
    if (outcome === "pending") {
      mutation.resolve(Response.json({ ok: true }));
      await save;
    }
    // Once no local phase changed during a refresh, even this project's newer server phase wins.
    globalThis.fetch = async () =>
      Response.json({
        deals: [
          { ...project, stage: "Approvals" },
          { ...sibling, stage: "Handover" },
        ],
        companies,
        role: "member",
      });
    await useCompaniesStore.getState().refresh();
    assert.equal(useCompaniesStore.getState().deals[0].stage, "Approvals");
    mock.restoreAll();
  }
});

test("unknown phase-write outcomes reload the server phase before the next move", async () => {
  for (const failure of [
    "transport-committed",
    "decode-committed",
    "transport-uncommitted",
  ] as const) {
    seed();
    const requests: string[] = [];
    const bodies: { expectedStage: string }[] = [];
    const serverPhase =
      failure === "transport-uncommitted" ? "Briefing" : "Construction";
    globalThis.fetch = async (url, init) => {
      requests.push(String(url));
      if (String(url) === "/api/crm") {
        assert.deepEqual(useCompaniesStore.getState().projectPhaseSaves, {});
        return Response.json({
          deals: [{ ...project, stage: serverPhase }],
          companies: useCompaniesStore.getState().companies,
          role: "member",
        });
      }
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length > 1) return Response.json({ ok: true });
      if (failure === "decode-committed")
        return new Response('{"ok":', { status: 200 });
      throw new TypeError("Connection interrupted");
    };
    assert.equal(
      await useCompaniesStore
        .getState()
        .changeProjectPhase(project.id, "Construction"),
      false,
    );
    assert.equal(useCompaniesStore.getState().deals[0].stage, serverPhase);
    assert.deepEqual(requests, ["/api/crm/deals", "/api/crm"]);
    assert.equal(
      await useCompaniesStore
        .getState()
        .changeProjectPhase(project.id, "Handover"),
      true,
    );
    assert.equal(bodies[1].expectedStage, serverPhase);
    assert.deepEqual(requests, [
      "/api/crm/deals",
      "/api/crm",
      "/api/crm/deals",
    ]);
    mock.restoreAll();
  }
});

test("an interrupted response after revocation does not refresh or restore project data", async () => {
  seed();
  let rejectBody!: (error: Error) => void;
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    bodyStarted = resolve;
  });
  const body = new Promise<never>((_resolve, reject) => {
    rejectBody = reject;
  });
  const response = Response.json({ ok: true });
  response.json = () => {
    bodyStarted();
    return body;
  };
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return response;
  };
  const save = useCompaniesStore
    .getState()
    .changeProjectPhase(project.id, "Construction");
  await started;
  useCompaniesStore.getState().blockAccess("denied", "Access revoked");
  rejectBody(new TypeError("Response body interrupted"));
  assert.equal(await save, false);
  assert.deepEqual(requests, ["/api/crm/deals"]);
  assert.deepEqual(useCompaniesStore.getState().deals, []);
  assert.deepEqual(useCompaniesStore.getState().projectPhaseSaves, {});
});

test("a 404 phase save removes the deleted project after clearing its pending marker", async () => {
  seed();
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url) === "/api/crm/deals")
      return Response.json(
        { error: "Project no longer exists." },
        { status: 404 },
      );
    assert.deepEqual(useCompaniesStore.getState().projectPhaseSaves, {});
    return Response.json({
      deals: [],
      companies: useCompaniesStore.getState().companies,
      role: "member",
    });
  };
  assert.equal(
    await useCompaniesStore
      .getState()
      .changeProjectPhase(project.id, "Construction"),
    false,
  );
  const state = useCompaniesStore.getState();
  assert.deepEqual(state.deals, []);
  assert.deepEqual(state.projectPhaseSaves, {});
  assert.equal(state.companies[0].openDeals, 0);
  assert.equal(state.companies[0].pipelineValue, 0);
  assert.deepEqual(requests, ["/api/crm/deals", "/api/crm"]);
  assert.equal(await state.changeProjectPhase(project.id, "Handover"), false);
  assert.equal(requests.length, 2);
});
