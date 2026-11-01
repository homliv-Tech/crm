import {
  ACTIVITY_WINDOWS,
  SEGMENTS,
  SORT_OPTIONS,
  STAGES,
} from "@/data/companies";
import { ALL_OWNERS, ANY_STAGE } from "@/lib/companies";

export const ownerOptions = (companies: { owner: string }[]) => [
  { value: ALL_OWNERS, label: "All Owners" },
  ...[...new Set(companies.map((c) => c.owner))]
    .sort()
    .map((name) => ({ value: name, label: name })),
];

export const STAGE_OPTIONS = [
  { value: ANY_STAGE, label: "Any" },
  ...[...SEGMENTS, ...STAGES].map((tag) => ({ value: tag, label: tag })),
];

export const ACTIVITY_OPTIONS = ACTIVITY_WINDOWS.map((days) => ({
  value: String(days),
  label: days === 0 ? "All time" : `${days} Days`,
}));

export const SORT_MENU_OPTIONS = SORT_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));
