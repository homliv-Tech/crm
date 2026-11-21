import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useCompaniesStore } from "../stores/companies-store";

const originalFetch = globalThis.fetch;
const destination = crypto.randomUUID();
function seed() {
  useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
  useCompaniesStore.setState({ accessState: "allowed", canWrite: true });
}
function snapshot() {
  return Response.json({ deals: [], companies: [], role: "member" });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  useCompaniesStore.setState(useCompaniesStore.getInitialState(), true);
});

test("an initial project destination survives a failed load and opens after recovery", async () => {
  seed();
  useCompaniesStore.getState().requestInitialProject(destination);
  globalThis.fetch = async () =>
    Response.json({ error: "Database unavailable" }, { status: 503 });
  await useCompaniesStore.getState().refresh();
  assert.equal(useCompaniesStore.getState().projectId, null);
  assert.equal(
    useCompaniesStore.getState().pendingProjectDestination,
    destination,
  );
  // Access recovery remounts Companies with the same initial destination.
  globalThis.fetch = async (url) =>
    String(url) === "/api/auth/access"
      ? Response.json({ role: "member" })
      : snapshot();
  assert.equal(await useCompaniesStore.getState().checkAccess(), true);
  useCompaniesStore.getState().requestInitialProject(destination);
  await useCompaniesStore.getState().refresh();
  const state = useCompaniesStore.getState();
  assert.equal(state.projectId, destination);
  assert.equal(state.activeTab, "deals");
  assert.equal(state.pendingProjectDestination, null);
});

test("navigation during loading cancels the pending initial destination", async () => {
  seed();
  useCompaniesStore.getState().requestInitialProject(destination);
  let finish!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      finish = resolve;
    });
  const loading = useCompaniesStore.getState().refresh();
  useCompaniesStore.getState().setActiveTab("contacts");
  finish(snapshot());
  await loading;
  assert.equal(useCompaniesStore.getState().activeTab, "contacts");
  assert.equal(useCompaniesStore.getState().projectId, null);
  assert.equal(useCompaniesStore.getState().pendingProjectDestination, null);
});

test("retries and remounts do not override deliberate navigation after the initial project opens", async () => {
  for (const navigate of [
    () => useCompaniesStore.getState().openProject("another-project"),
    () => useCompaniesStore.getState().closeProject(),
    () => useCompaniesStore.getState().setActiveTab("tasks"),
    () => useCompaniesStore.getState().openDetail("another-client"),
  ]) {
    seed();
    globalThis.fetch = async () => snapshot();
    useCompaniesStore.getState().requestInitialProject(destination);
    await useCompaniesStore.getState().refresh();
    navigate();
    const before = useCompaniesStore.getState();
    useCompaniesStore.getState().requestInitialProject(destination);
    await useCompaniesStore.getState().refresh();
    const after = useCompaniesStore.getState();
    assert.equal(after.projectId, before.projectId);
    assert.equal(after.activeTab, before.activeTab);
    assert.equal(after.detailId, before.detailId);
    assert.equal(after.detailOpen, before.detailOpen);
    assert.equal(after.pendingProjectDestination, null);
  }
});

test("an obsolete load cannot consume the pending destination after access changes", async () => {
  seed();
  useCompaniesStore.getState().requestInitialProject(destination);
  let finish!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      finish = resolve;
    });
  const loading = useCompaniesStore.getState().refresh();
  useCompaniesStore.getState().blockAccess("unavailable", "Reconnect");
  finish(snapshot());
  await loading;
  assert.equal(useCompaniesStore.getState().projectId, null);
  assert.equal(
    useCompaniesStore.getState().pendingProjectDestination,
    destination,
  );
});
