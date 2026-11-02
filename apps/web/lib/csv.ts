export type CsvCell = string | number;

function escapeCell(cell: CsvCell) {
  let value = String(cell);
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value)) value = `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
