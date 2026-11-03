import { parseWorkspace, STORAGE_KEY, type Workspace } from "./quotation";

export function resetQuotationCrmVersion(
  workspace: Workspace,
  id: string,
): Workspace {
  if (!workspace.quotes.some((q) => q.id === id && q.crmVersion !== 0))
    return workspace;
  return {
    ...workspace,
    quotes: workspace.quotes.map((q) =>
      q.id === id ? { ...q, crmVersion: 0 } : q,
    ),
  };
}

export function resetStoredQuotationCrmVersion(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
) {
  const stored = storage.getItem(STORAGE_KEY);
  if (!stored) return;
  const workspace = parseWorkspace(stored);
  const updated = resetQuotationCrmVersion(workspace, id);
  if (updated !== workspace)
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
