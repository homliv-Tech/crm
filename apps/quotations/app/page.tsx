import QuotationApp from "../components/quotation-app";

export default function Page() {
  return (
    <QuotationApp
      crmUrl={
        process.env.HOMLIV_CRM_URL ||
        (process.env.NODE_ENV === "development"
          ? "http://localhost:3000"
          : undefined)
      }
    />
  );
}
