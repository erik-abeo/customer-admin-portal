/**
 * Tiny CSV utility — RFC 4180-ish. Strings are quoted when they contain
 * delimiters, quotes, or newlines; embedded quotes are doubled. Numbers and
 * booleans are stringified. `null` and `undefined` become an empty cell.
 */

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = CsvCell[];

const NEEDS_QUOTING = /[",\r\n]/;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (!NEEDS_QUOTING.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvRow[]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Allow the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
