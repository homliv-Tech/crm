import { isActiveProject } from "./projects";
import type { Tag } from "@/data/companies";
import type { Activity, Deal, CrmCompany } from "./types";

type Account = {
  id: string;
  name: string;
  logo: string | null;
  tags: string[];
  owner: string;
  website: string;
  description: string;
};
export function summarizeCompanies(
  accounts: Account[],
  deals: Deal[],
  activities: Activity[],
  now = new Date(),
): CrmCompany[] {
  return accounts.map((company) => {
    const open = deals.filter(
      (d) => d.companyId === company.id && isActiveProject(d.stage),
    );
    const pipelineValue = open.reduce((sum, d) => sum + Number(d.value), 0);
    const history = activities
      .filter((a) => a.companyId === company.id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const last = history[0];
    const trend = Array.from({ length: 14 }, (_, i) => {
      const target = new Date(now.getTime() - (13 - i) * 86400000)
        .toISOString()
        .slice(0, 10);
      return history.filter((a) => a.occurredAt.slice(0, 10) === target).length;
    });
    return {
      ...company,
      tags: company.tags as Tag[],
      logo: company.logo ?? undefined,
      openDeals: open.length,
      pipelineValue,
      winProbability: pipelineValue
        ? Math.round(
            open.reduce((sum, d) => sum + Number(d.value) * d.probability, 0) /
              pipelineValue,
          )
        : open.length
          ? Math.round(
              open.reduce((sum, d) => sum + d.probability, 0) / open.length,
            )
          : 0,
      trend,
      lastInteraction: {
        date: last?.occurredAt.slice(0, 10) ?? "",
        label: last?.type ?? "No activity",
      },
      activityDays: last
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - Date.parse(last.occurredAt)) / 86400000,
            ),
          )
        : Number.MAX_SAFE_INTEGER,
    };
  });
}
