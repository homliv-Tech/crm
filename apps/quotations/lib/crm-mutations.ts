export type CrmMutationRunner = (
  operation: () => Promise<void>,
) => Promise<void>;

// The synchronous guard also covers clicks before React renders disabled controls.
export function createCrmMutationRunner(
  setBusy: (busy: boolean) => void,
): CrmMutationRunner {
  let active = false;
  return async (operation) => {
    if (active) return;
    active = true;
    setBusy(true);
    try {
      await operation();
    } finally {
      active = false;
      setBusy(false);
    }
  };
}
