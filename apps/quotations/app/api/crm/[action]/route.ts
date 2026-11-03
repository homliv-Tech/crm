import { createCrmSessionHandler } from "../../../../lib/crm-session";

const handle = createCrmSessionHandler({
  crmUrl: () =>
    process.env.HOMLIV_CRM_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined),
});
async function route(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return handle(request, (await context.params).action);
}
export const GET = route;
export const POST = route;
