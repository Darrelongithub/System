/**
 * Verifier input preparation.
 *
 * The AI verifier is a production component: it picks the setup the trader acts
 * on, so everything it sees must be knowable at decision time. Three of the
 * analyzer CSV's columns are NOT:
 *
 *   similar_swing_retrace_pct    measured over up to 40 *future* bars
 *   similar_swing_continued_pct  same forward window
 *   swing_invalidated            "has any LATER row in the dataset closed past
 *                                 this swing"
 *
 * On a historical window they encode the market's actual answer, live they are
 * empty or carried forward — so a verifier verdict reached on historical data
 * cannot be reproduced live. The trade engine never reads them; this module keeps
 * them out of the verifier prompt as well, by blanking the columns while leaving
 * the file's structure (header, row count, every other column) untouched.
 *
 * Kept deliberately dependency-free so it can run on the edge/server runtime that
 * hosts the verifier.
 */

/** Columns derived from bars AFTER the row they describe. */
export const HINDSIGHT_COLUMNS = [
  "similar_swing_retrace_pct",
  "similar_swing_continued_pct",
  "swing_invalidated",
] as const;

export type HindsightColumn = (typeof HINDSIGHT_COLUMNS)[number];

/** Minimal RFC-4180 cell splitter (quotes, escaped quotes). Exported for tests. */
export const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
};

const escapeCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Blank the hindsight-derived columns in an analyzer CSV.
 *
 * Header and row count are preserved, every other column is byte-identical, and
 * lines that are not part of the table (metadata comment, `=== DAY ===` section
 * markers) pass through unchanged, so the model still sees an intact document.
 * If none of the columns are present the input is returned unchanged.
 */
export function stripHindsightColumns(csv: string): {
  csv: string;
  strippedColumns: string[];
  strippedRows: number;
} {
  const lines = csv.split("\n");
  const headerIndex = lines.findIndex((line) => {
    if (!line || line.startsWith("#")) return false;
    const cells = splitCsvLine(line);
    return (
      cells.includes("datetime") &&
      cells.some((c) => HINDSIGHT_COLUMNS.includes(c as HindsightColumn))
    );
  });
  if (headerIndex < 0) return { csv, strippedColumns: [], strippedRows: 0 };

  const header = splitCsvLine(lines[headerIndex]!);
  const targets = header
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => HINDSIGHT_COLUMNS.includes(name as HindsightColumn));
  if (targets.length === 0) return { csv, strippedColumns: [], strippedRows: 0 };

  let strippedRows = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "" || line.startsWith("===")) continue;
    const cells = splitCsvLine(line);
    if (cells.length !== header.length) continue; // not a data row — leave it alone
    let touched = false;
    for (const { index } of targets) {
      if (cells[index] !== "" && cells[index] !== undefined) {
        cells[index] = "";
        touched = true;
      }
    }
    if (touched) {
      strippedRows += 1;
      lines[i] = cells.map(escapeCell).join(",");
    }
  }
  return { csv: lines.join("\n"), strippedColumns: targets.map((t) => t.name), strippedRows };
}
