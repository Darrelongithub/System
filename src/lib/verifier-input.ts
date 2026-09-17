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
 * Keep only the part of an analyzer CSV that existed at `cutoff` ("YYYY-MM-DD
 * HH:MM:SS", EAT — the same wall clock the rows carry).
 *
 * The backtest replays history, so the file it holds spans warm-up AND the
 * forward bars used to resolve the day's trades. Handing that whole file to the
 * verifier lets the model read the answer off the chart it is asked to judge;
 * the live analyzer's CSV always ends at "now" instead. This drops every data row
 * after the cutoff (and any `=== DAY ===` marker for a later day), preserving the
 * metadata line, the header and the rows before it byte-for-byte, then appends a
 * note that the tail was withheld so the model is not left guessing why the
 * document ends early.
 *
 * Returns the input unchanged when nothing is after the cutoff.
 */
const DATA_ROW_START = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

export function truncateCsvAt(csv: string, cutoff: string): { csv: string; droppedRows: number } {
  const lines = csv.split("\n");
  if (lines.length === 0) return { csv, droppedRows: 0 };
  // Everything before the first data row is document structure (metadata header,
  // column header, any comment block) and always survives.
  const firstDataRow = lines.findIndex((line) => DATA_ROW_START.test(line));
  const structural = firstDataRow === -1 ? lines.length : firstDataRow;
  const out: string[] = lines.slice(0, structural);
  const cutoffDay = cutoff.slice(0, 10);
  let droppedRows = 0;
  for (let i = structural; i < lines.length; i++) {
    const line = lines[i]!;
    if (DATA_ROW_START.test(line)) {
      if (line.slice(0, 19) <= cutoff) out.push(line);
      else droppedRows += 1;
      continue;
    }
    // Section/day markers belong to the day they name; a marker for a day after
    // the cutoff would announce rows this copy no longer contains.
    const markerDay = /^===.*?(\d{4}-\d{2}-\d{2})/.exec(line);
    if (markerDay && markerDay[1]! > cutoffDay) continue;
    out.push(line);
  }
  if (droppedRows === 0) return { csv, droppedRows: 0 };
  out.push(
    `# note: ${droppedRows} row(s) after ${cutoff} withheld — bars later than the checkpoint are not knowable when the decision is made`,
  );
  return { csv: out.join("\n"), droppedRows };
}

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
