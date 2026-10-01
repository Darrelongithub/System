import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import type { Candle as EngineCandle } from "../src/lib/analyzer/types.ts";
import { parseEatDatetime } from "../src/lib/synth/math.ts";

const inputPaths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const paths = inputPaths.length ? inputPaths : ["artifacts/baseline-xauusd-ohlc.csv"];
const rows: Array<{
  path: string;
  hash: string;
  candles: EngineCandle[];
  metadata: Record<string, unknown>;
  columns: string[];
}> = [];

for (const path of paths) {
  const text = readFileSync(path, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const metadataStart = firstLine.indexOf("{");
  const metadata =
    metadataStart >= 0
      ? (JSON.parse(firstLine.slice(metadataStart)) as Record<string, unknown>)
      : {};
  const headerLine = text.split(/\r?\n/)[1] ?? "";
  const columns = headerLine.split(",").map((column) => column.trim());
  const parsed = parseCsv(text);
  if (parsed.metadataError) throw new Error(`${path}: ${parsed.metadataError}`);
  rows.push({
    path,
    hash: createHash("sha256").update(text).digest("hex"),
    candles: parsed.candles,
    metadata,
    columns,
  });
}

const allCandles = rows.flatMap((row) => row.candles).filter((candle) => !candle.invalid);
const yearCounts: Record<string, number> = {};
const weekdayCounts: Record<string, number> = {};
const dateCounts = new Map<string, number>();
const duplicateTimestamps: string[] = [];
const nonIncreasing: Array<{ previous: string; current: string }> = [];
const longGaps: Array<{
  previous: string;
  current: string;
  minutes: number;
  openGap: number;
  priorAtr: number | null;
}> = [];
const sourceSeams: Array<{
  fromFile: string;
  toFile: string;
  previous: string;
  current: string;
  minutes: number;
  openGap: number;
  duplicate: boolean;
}> = [];
const seen = new Set<string>();
let minimumPrice = Infinity;
let maximumPrice = -Infinity;
let minTime: string | undefined;
let maxTime: string | undefined;
let priorValid: EngineCandle | undefined;
let previousFileLast: { file: string; candle: EngineCandle } | undefined;
const hashInput = (text: string) => createHash("sha256").update(text).digest("hex");

function dateOf(datetime: string): string {
  return datetime.slice(0, 10);
}

function weekdayOf(datetime: string): number {
  const time = parseEatDatetime(datetime);
  return time === undefined ? -1 : new Date(time + 3 * 60 * 60 * 1000).getUTCDay();
}

for (const file of rows) {
  const valid = file.candles.filter((candle) => !candle.invalid);
  if (valid.length > 0 && previousFileLast) {
    const from = previousFileLast.candle;
    const to = valid[0]!;
    const fromTime = parseEatDatetime(from.datetime);
    const toTime = parseEatDatetime(to.datetime);
    const minutes =
      fromTime !== undefined && toTime !== undefined ? (toTime - fromTime) / 60_000 : NaN;
    const duplicate = from.datetime === to.datetime;
    sourceSeams.push({
      fromFile: previousFileLast.file,
      toFile: file.path,
      previous: from.datetime,
      current: to.datetime,
      minutes,
      openGap: (to.open ?? 0) - (from.close ?? 0),
      duplicate,
    });
  }
  if (valid.length > 0) previousFileLast = { file: file.path, candle: valid[valid.length - 1]! };

  for (const candle of file.candles) {
    if (
      candle.invalid ||
      candle.open === undefined ||
      candle.high === undefined ||
      candle.low === undefined ||
      candle.close === undefined
    ) {
      continue;
    }
    const date = dateOf(candle.datetime);
    dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
    const year = date.slice(0, 4);
    yearCounts[year] = (yearCounts[year] ?? 0) + 1;
    const day = weekdayOf(candle.datetime);
    const weekdayName =
      ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ??
      "unknown";
    weekdayCounts[weekdayName] = (weekdayCounts[weekdayName] ?? 0) + 1;
    minimumPrice = Math.min(minimumPrice, candle.low);
    maximumPrice = Math.max(maximumPrice, candle.high);
    minTime ??= candle.datetime;
    maxTime = candle.datetime;
    if (seen.has(candle.datetime)) duplicateTimestamps.push(candle.datetime);
    seen.add(candle.datetime);
    const currentMs = parseEatDatetime(candle.datetime);
    const priorMs = priorValid ? parseEatDatetime(priorValid.datetime) : undefined;
    if (priorValid && currentMs !== undefined && priorMs !== undefined) {
      const deltaMinutes = (currentMs - priorMs) / 60_000;
      if (deltaMinutes <= 0)
        nonIncreasing.push({ previous: priorValid.datetime, current: candle.datetime });
      if (deltaMinutes > 30) {
        longGaps.push({
          previous: priorValid.datetime,
          current: candle.datetime,
          minutes: deltaMinutes,
          openGap: (candle.open ?? 0) - (priorValid.close ?? 0),
          priorAtr: priorValid.atr30m ?? null,
        });
      }
    }
    priorValid = candle;
  }
}

const first = allCandles[0];
const last = allCandles[allCandles.length - 1];
const missingDates: string[] = [];
if (first && last) {
  const start = new Date(`${dateOf(first.datetime)}T00:00:00Z`);
  const end = new Date(`${dateOf(last.datetime)}T00:00:00Z`);
  for (
    let current = new Date(start.getTime() + 86_400_000);
    current < end;
    current = new Date(current.getTime() + 86_400_000)
  ) {
    const date = current.toISOString().slice(0, 10);
    if (!dateCounts.has(date)) missingDates.push(date);
  }
}
const rowsReport = rows.map((row) => {
  const valid = row.candles.filter((candle) => !candle.invalid);
  return {
    path: row.path,
    sha256: row.hash,
    parsedBars: row.candles.length,
    validBars: valid.length,
    invalidBars: row.candles.length - valid.length,
    start: valid[0]?.datetime ?? null,
    end: valid.at(-1)?.datetime ?? null,
    columns: row.columns,
    metadata: {
      data_age: row.metadata["data_age"] ?? null,
      atr_method: row.metadata["atr_method"] ?? null,
      spread_convention: row.metadata["spread_convention"] ?? null,
    },
  };
});

const report = {
  inspectedFiles: rowsReport,
  aggregate: {
    bars: allCandles.length,
    barsPerYear: Object.fromEntries(Object.entries(yearCounts).sort()),
    span: { start: minTime ?? null, end: maxTime ?? null },
    priceRange: Number.isFinite(minimumPrice) ? { low: minimumPrice, high: maximumPrice } : null,
    weekdayBarsEAT: weekdayCounts,
    observedTradingDates: dateCounts.size,
    barsPerObservedDate: Object.fromEntries(
      [...new Set(dateCounts.values())]
        .sort((a, b) => a - b)
        .map((count) => [
          String(count),
          [...dateCounts.values()].filter((value) => value === count).length,
        ]),
    ),
    duplicateTimestamps: duplicateTimestamps.length,
    duplicateTimestampSamples: duplicateTimestamps.slice(0, 20),
    nonIncreasingTimestampPairs: nonIncreasing,
    calendarGapsLongerThan30m: longGaps.length,
    longGapSamples: longGaps.slice(0, 60),
    missingCalendarDates: missingDates.length,
    missingCalendarDateSamples: missingDates.slice(0, 100),
    fileSeams: sourceSeams,
    fileSeamReportSha256: hashInput(JSON.stringify(sourceSeams)),
  },
  interpretation: {
    timezone:
      "Input datetimes are unzoned EAT wall-clock strings by the repo contract and task rule; +03:00 is assumed, not printed in each row.",
    engineInput:
      "runAnalysis(text: string, options?: RunOptions) parses CSV metadata plus header-name OHLC rows; required header columns are datetime,open,high,low,close,is_reliable. The analyzer Candle type is enriched output, not the raw input type.",
    atr: "The analyzer's atrSeries() implements Wilder ATR(14) only as a fallback; a supplied atr_30m value overrides it. This baseline declares simple rolling mean ATR and supplies atr_30m. Synthetic toCsv() therefore omits atr_30m to activate Wilder ATR(14).",
    noSilentRepair:
      "Files are inspected in argument order. This script does not sort, deduplicate, fill bars, relabel timestamps, or recompute supplied columns in-place.",
  },
};

console.log(JSON.stringify(report, null, 2));
