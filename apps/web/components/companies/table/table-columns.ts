export const TABLE_COLUMNS = [
  { key: "name", label: "Companies", className: "justify-start" },
  { key: "segment", label: "Segment & Stage", className: "justify-start" },
  { key: "owner", label: "Account Owner", className: "justify-start" },
  {
    key: "openDeals",
    label: "Open Deals",
    className: "justify-end tabular-nums",
  },
  {
    key: "pipelineValue",
    label: "Pipeline Value",
    className: "justify-end tabular-nums",
  },
  {
    key: "winProbability",
    label: "Win Probability",
    className: "justify-end tabular-nums",
  },
  { key: "trend", label: "Activity Trend", className: "justify-center" },
  {
    key: "lastInteraction",
    label: "Last Interaction",
    className: "justify-start",
  },
  { key: "action", label: "Action", className: "justify-center" },
] as const;

export type TableColumnKey = (typeof TABLE_COLUMNS)[number]["key"];

export const TABLE_GRID_CLASS =
  "grid min-w-max grid-cols-[repeat(9,max-content)] justify-between";

export const TABLE_ROW_CLASS = "col-span-full grid grid-cols-subgrid";

export const TABLE_CELL_CLASS = "flex items-center";

export function columnClass(key: TableColumnKey) {
  return TABLE_COLUMNS.find((column) => column.key === key)?.className ?? "";
}
