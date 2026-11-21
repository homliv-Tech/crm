import assert from "node:assert/strict";
import { test } from "node:test";
import { trackProjectMoveFocus } from "../lib/crm/project-move-focus";

class TestDocument extends EventTarget {
  body = new EventTarget();
  activeElement: EventTarget = this.body;
  defaultView = new EventTarget();
  notify(type: string, target: EventTarget) {
    const event = new Event(type);
    Object.defineProperty(event, "target", { value: target });
    this.dispatchEvent(event);
  }
}
class TestControl extends EventTarget {
  isConnected = true;
  disabled = false;
  focusCount = 0;
  constructor(public ownerDocument: TestDocument) {
    super();
  }
  contains(target: EventTarget | null) {
    return target === this;
  }
  focus() {
    this.focusCount++;
    this.ownerDocument.activeElement = this;
    this.ownerDocument.notify("focusin", this);
  }
  remove() {
    this.isConnected = false;
    if (this.ownerDocument.activeElement === this)
      this.ownerDocument.activeElement = this.ownerDocument.body;
  }
}
function fixture() {
  const doc = new TestDocument();
  const source = new TestControl(doc),
    phase = new TestControl(doc),
    open = new TestControl(doc),
    fallback = new TestControl(doc);
  source.focus();
  const targets = {
    phase: phase as unknown as HTMLSelectElement,
    open: open as unknown as HTMLAnchorElement,
    fallback: fallback as unknown as HTMLSelectElement,
  };
  return {
    doc,
    source,
    phase,
    open,
    fallback,
    targets,
    tracker: trackProjectMoveFocus(
      source as unknown as HTMLSelectElement,
      () => targets,
    ),
  };
}

test("a moved card focuses its available open control while saving, then the phase menu on success", () => {
  const { doc, source, phase, open, tracker } = fixture();
  source.remove();
  doc.notify("focusin", doc.body);
  phase.disabled = true;
  assert.equal(tracker.reconcile(true), true);
  assert.equal(doc.activeElement, open);
  phase.disabled = false;
  assert.equal(tracker.reconcile(false), false);
  assert.equal(doc.activeElement, phase);
});

test("rollback restores focus to the card's replacement phase menu", () => {
  const { doc, source, phase, open, targets, tracker } = fixture();
  source.remove();
  phase.disabled = true;
  tracker.reconcile(true);
  phase.remove();
  open.remove();
  const rolledBack = new TestControl(doc);
  targets.phase = rolledBack as unknown as HTMLSelectElement;
  tracker.reconcile(false);
  assert.equal(doc.activeElement, rolledBack);
});

test("filtering out the moved card focuses a stable board control", () => {
  const { doc, source, phase, open, fallback, tracker } = fixture();
  source.remove();
  phase.remove();
  open.remove();
  tracker.reconcile(true);
  assert.equal(doc.activeElement, fallback);
  tracker.reconcile(false);
  assert.equal(doc.activeElement, fallback);
});

test("user focus changes cancel restoration even if that new control later disappears", () => {
  const { doc, source, phase, open, tracker } = fixture();
  source.remove();
  phase.disabled = true;
  tracker.reconcile(true);
  assert.equal(doc.activeElement, open);
  const elsewhere = new TestControl(doc);
  elsewhere.focus();
  elsewhere.remove();
  phase.disabled = false;
  assert.equal(tracker.reconcile(false), false);
  assert.equal(doc.activeElement, doc.body);
  assert.equal(phase.focusCount, 0);
});

test("pointer interactions and leaving the window cancel pending focus restoration", () => {
  for (const interaction of ["pointer", "window"] as const) {
    const { doc, source, phase, tracker } = fixture();
    source.remove();
    if (interaction === "pointer") doc.notify("pointerdown", doc.body);
    else doc.defaultView.dispatchEvent(new Event("blur"));
    assert.equal(tracker.reconcile(false), false);
    assert.equal(phase.focusCount, 0);
  }
});

test("unfocused moves and disposed trackers never move focus", () => {
  const { source, phase, tracker } = fixture();
  tracker.cancel();
  source.remove();
  tracker.reconcile(false);
  assert.equal(phase.focusCount, 0);
  const unfocused = trackProjectMoveFocus(
    source as unknown as HTMLSelectElement,
    () => ({ phase: phase as unknown as HTMLSelectElement }),
  );
  assert.equal(unfocused.reconcile(false), false);
  assert.equal(phase.focusCount, 0);
});

test("focus tracking survives a rollback followed by the conflict recovery reload", () => {
  const { doc, source, phase, targets, tracker } = fixture();
  source.remove();
  tracker.reconcile(true);
  assert.equal(doc.activeElement, phase);
  // Saving may finish before the conflict reload remounts the card again.
  phase.remove();
  const canonical = new TestControl(doc);
  targets.phase = canonical as unknown as HTMLSelectElement;
  tracker.reconcile(false);
  assert.equal(doc.activeElement, canonical);
});
