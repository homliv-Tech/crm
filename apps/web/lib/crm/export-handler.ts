import { z } from "zod";
import { sameOrigin } from "../access-policy";
import {
  DEFAULT_FILTERS,
  companiesCsvRows,
  filterCompanies,
} from "../companies";
import { toCsv } from "../csv";
import type { CrmSnapshot } from "./types";
const filters = z.object({
  sortBy: z
    .enum([
      "name",
      "lastInteraction",
      "openDeals",
      "winProbability",
      "pipelineValue",
    ])
    .default(DEFAULT_FILTERS.sortBy),
  owner: z.string().max(256).default(DEFAULT_FILTERS.owner),
  stage: z.string().max(256).default(DEFAULT_FILTERS.stage),
  activityWindow: z.number().int().min(0).max(36500).default(0),
});
export function createExportHandler(deps: {
  authorize: () => Promise<object | Response>;
  getSnapshot: () => Promise<CrmSnapshot>;
}) {
  return async (request: Request) => {
    const access = await deps.authorize();
    if (access instanceof Response) return access;
    if (!sameOrigin(request))
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    try {
      const raw = await request.text();
      if (raw.length > 4096)
        return Response.json(
          { error: "Request is too large." },
          { status: 413 },
        );
      const values = filters.parse(JSON.parse(raw));
      const snapshot = await deps.getSnapshot();
      const csv = toCsv(
        companiesCsvRows(filterCompanies(snapshot.companies, values)),
      );
      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="companies-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return Response.json(
          { error: "Invalid export filters." },
          { status: 400 },
        );
      return Response.json(
        { error: "Could not export CRM records. Please try again." },
        { status: 503 },
      );
    }
  };
}
