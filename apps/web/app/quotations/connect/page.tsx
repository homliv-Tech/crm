import { connectionOrigin } from "@crm/quotations/crm-bridge";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import CrmBridge from "./crm-bridge";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge } = await searchParams;
  const validChallenge =
    typeof challenge === "string" && /^[A-Za-z0-9_-]{43}$/.test(challenge)
      ? challenge
      : "";
  const destination = `/quotations/connect${validChallenge ? `?challenge=${validChallenge}` : ""}`;
  const access = await getAccess();
  if (access.status === 401 || access.status === 503)
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  if (access.status !== 200) redirect("/access-denied");
  const quotationOrigin =
    process.env.QUOTATIONS_ORIGIN ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");
  return (
    <CrmBridge
      quotationOrigin={connectionOrigin(quotationOrigin)}
      email={access.user.email}
      challenge={validChallenge}
    />
  );
}
