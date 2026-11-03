import QuotationApp from "@crm/quotations/app";
import { getAccess } from "@/lib/auth";
import "@crm/quotations/styles";

export default async function QuotationsPage() {
  const access = await getAccess();
  return (
    <QuotationApp
      crmEnabled={access.status === 200}
      signInHref="/login?next=%2Fquotations"
    />
  );
}
