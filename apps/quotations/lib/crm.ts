import { quotationSchema, type Quotation, type Workspace } from "./quotation";

export type CrmQuotationSummary = {
  id: string;
  number: string;
  title: string;
  client: string;
  status: Quotation["status"];
};

export function openCrmQuotation(
  workspace: Workspace,
  row: { document: unknown; version: number },
): Workspace {
  const loaded = quotationSchema.parse({
    ...(row.document as object),
    crmVersion: row.version,
  });
  const existing = workspace.quotes.find((q) => q.id === loaded.id);
  if (!existing && workspace.quotes.length >= 100)
    throw new Error(
      "Workspace is full. Remove a local draft, then open this quotation again.",
    );
  const selected =
    existing && existing.updatedAt > loaded.updatedAt ? existing : loaded;
  return {
    ...workspace,
    activeId: selected.id,
    quotes: [selected, ...workspace.quotes.filter((q) => q.id !== selected.id)],
  };
}

export type CrmData = {
  companies: { id: string; name: string; description: string }[];
  contacts: {
    id: string;
    companyId: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  }[];
  deals: {
    id: string;
    companyId: string;
    title: string;
    siteAddress: string;
    brief: string;
  }[];
  role: string;
};

export function clientPatch(
  data: CrmData,
  companyId: string,
): Partial<Quotation> {
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) return { crm: null };
  return {
    crm: { companyId, contactId: null, projectId: null },
    clientType: "Company",
    to: { name: company.name, email: "", phone: "", address: "", taxId: "" },
  };
}

export async function crmRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not connect to CRM.");
  return body;
}
