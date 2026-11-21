type MoveTargets = {
  phase?: HTMLSelectElement | null;
  open?: HTMLAnchorElement | null;
  fallback?: HTMLSelectElement | null;
};

export function trackProjectMoveFocus(
  source: HTMLSelectElement,
  targets: () => MoveTargets,
) {
  const doc = source.ownerDocument;
  let control: HTMLElement = source;
  let active = doc.activeElement === source;
  const cancel = () => {
    active = false;
    doc.removeEventListener("focusin", onFocus, true);
    doc.removeEventListener("pointerdown", onPointer, true);
    doc.defaultView?.removeEventListener("blur", cancel);
  };
  const controlUnavailable = () =>
    !control.isConnected ||
    ("disabled" in control && Boolean(control.disabled));
  const onFocus = (event: Event) => {
    if (
      event.target !== control &&
      !(event.target === doc.body && controlUnavailable())
    )
      cancel();
  };
  const onPointer = (event: Event) => {
    if (!control.contains(event.target as Node | null)) cancel();
  };
  if (active) {
    doc.addEventListener("focusin", onFocus, true);
    doc.addEventListener("pointerdown", onPointer, true);
    doc.defaultView?.addEventListener("blur", cancel);
  }
  return {
    cancel,
    reconcile(saving: boolean) {
      if (!active) return false;
      const focusWasLost =
        doc.activeElement === doc.body && controlUnavailable();
      if (doc.activeElement !== control && !focusWasLost) {
        cancel();
        return false;
      }
      const { phase, open, fallback } = targets();
      const next = [phase, open, fallback].find(
        (element) =>
          element?.isConnected && !("disabled" in element && element.disabled),
      );
      if (next && next !== control) {
        control = next;
        control.focus();
      }
      if (!saving) cancel();
      return active;
    },
  };
}
