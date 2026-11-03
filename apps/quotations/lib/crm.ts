import type { Quotation } from "./quotation";

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
