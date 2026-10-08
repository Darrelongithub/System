import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const INPUT_FILE = "XAUUSD_30min_2020-01-24_to_2026-10-01.csv";
export const INPUT_SHA256 = "cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3";
export const DETECTOR_TREE_SHA256 =
  "05134d0d8201dfb368579bcf373fc52a406c1c4d49b3576ad1bc8cbc5e0993f1";
export const DEFAULT_OPTIONS_SHA256 =
  "7504bf25fb8875ee6e5c2eb211ad50581b00f2edd7052a943ae8fc7fefa452fe";
export const SPEC_SHA256 = "0f5bd4bd5e02c9a30a7a63f70195a79313289279cb2ba427047cd3bb9c4a923f";
export const LABELS = [
  "bullish-trend",
  "bearish-trend",
  "range",
  "high-volatility",
  "compression",
  "transition",
];
export const SPLITS = [
  { key: "H1", start: "2020-01-24", end: "2023-06-30" },
  { key: "H2", start: "2023-07-01", end: "2026-10-01" },
];

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

export async function directoryTreeSha256(root) {
  const files = await listFiles(root);
  const manifest = {};
  for (const relative of files) {
    manifest[relative] = sha256(await readFile(path.join(root, relative)));
  }
  return sha256(Buffer.from(JSON.stringify(manifest), "utf8"));
}

export function splitCsvRecord(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (quoted) {
      if (character === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  fields.push(field.trim());
  return fields;
}

export function parseEATDate(value, lineNumber = "?") {
  const match = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match)
    throw new Error(`line ${lineNumber}: invalid EAT wall-clock timestamp ${String(value)}`);
  const [yearText, monthText, dayText, hourText, minuteText, secondText, millisText] =
    match.slice(1);
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? 0);
  const millis = Number((millisText ?? "0").padEnd(3, "0"));
  const epoch = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const date = new Date(epoch);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(`line ${lineNumber}: impossible EAT timestamp ${String(value)}`);
  }
  return {
    value: String(value).trim(),
    dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    epoch,
  };
}

export function parseGoldCsv(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const metadataLine = lines.find((line) => line.trim() !== "");
  if (!metadataLine) throw new Error("CSV is empty");
  const brace = metadataLine.indexOf("{");
  if (brace < 0) throw new Error("CSV metadata JSON was not found");
  const metadata = JSON.parse(metadataLine.slice(brace));
  const metadataIndex = lines.indexOf(metadataLine);
  let headerIndex = metadataIndex + 1;
  while (headerIndex < lines.length && lines[headerIndex].trim() === "") headerIndex++;
  if (headerIndex >= lines.length) throw new Error("CSV header is missing");
  const header = splitCsvRecord(lines[headerIndex]).map((value) => value.toLowerCase());
  const required = ["datetime", "open", "high", "low", "close"];
  for (const name of required) {
    if (!header.includes(name)) throw new Error(`CSV header is missing ${name}`);
  }
  const markers = metadata.section_marker_convention?.match(/[=\-#*~_+>|]{2,}/g) ?? [];
  const index = Object.fromEntries(header.map((name, column) => [name, column]));
  const bars = [];
  let skippedDividerLines = 0;
  let parsedDataRows = 0;
  let priorTimestamp = -Infinity;
  const numeric = (cell, field, lineNumber) => {
    const value = Number(cell);
    if (cell === "" || !Number.isFinite(value)) {
      throw new Error(`line ${lineNumber}: ${field} is not a finite number`);
    }
    return value;
  };

  for (let row = headerIndex + 1; row < lines.length; row++) {
    const line = lines[row];
    if (line.trim() === "") continue;
    const trimmed = line.trim();
    if (markers.some((marker) => trimmed.startsWith(marker) || trimmed.endsWith(marker))) {
      skippedDividerLines++;
      continue;
    }
    const cells = splitCsvRecord(line);
    if (cells.length !== header.length) {
      throw new Error(
        `line ${row + 1}: expected ${header.length} CSV columns, got ${cells.length}`,
      );
    }
    parsedDataRows++;
    const stamp = parseEATDate(cells[index.datetime], row + 1);
    if (stamp.epoch <= priorTimestamp) {
      throw new Error(`line ${row + 1}: duplicate or out-of-order timestamp ${stamp.value}`);
    }
    priorTimestamp = stamp.epoch;
    const open = numeric(cells[index.open], "open", row + 1);
    const high = numeric(cells[index.high], "high", row + 1);
    const low = numeric(cells[index.low], "low", row + 1);
    const close = numeric(cells[index.close], "close", row + 1);
    if (low > high || low > open || low > close || high < open || high < close) {
      throw new Error(`line ${row + 1}: invalid OHLC geometry`);
    }
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      throw new Error(`line ${row + 1}: OHLC prices must be positive for log returns`);
    }
    const volume =
      index.volume === undefined || cells[index.volume] === ""
        ? null
        : numeric(cells[index.volume], "volume", row + 1);
    if (volume !== null && volume < 0) throw new Error(`line ${row + 1}: negative volume`);
    bars.push({
      timestamp: stamp.value,
      open,
      high,
      low,
      close,
      volume,
      dateKey: stamp.dateKey,
      year: stamp.year,
      weekday: stamp.weekday,
    });
  }
  if (parsedDataRows !== bars.length) throw new Error("internal row accounting mismatch");
  if (bars.length === 0) throw new Error("CSV has no OHLC rows");
  return {
    metadata,
    bars,
    header,
    parsedDataRows,
    skippedDividerLines,
    hasVolume: index.volume !== undefined,
  };
}

function businessDateOrdinals(bars) {
  const [firstYear, firstMonth, firstDay] = bars[0].dateKey.split("-").map(Number);
  const [lastYear, lastMonth, lastDay] = bars.at(-1).dateKey.split("-").map(Number);
  const first = Date.UTC(firstYear, firstMonth - 1, firstDay);
  const last = Date.UTC(lastYear, lastMonth - 1, lastDay);
  const ordinalByDate = new Map();
  let ordinal = 0;
  for (let epoch = first; epoch <= last; epoch += 86400000) {
    const date = new Date(epoch);
    const weekday = date.getUTCDay();
    if (weekday >= 1 && weekday <= 5) ordinal++;
    ordinalByDate.set(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
      ordinal,
    );
  }
  return bars.map((bar) => ordinalByDate.get(bar.dateKey));
}

export function minimumFiveWeekdayOffset(bars) {
  if (!bars.length) throw new RangeError("five-weekday offset requires at least one bar");
  const ordinal = businessDateOrdinals(bars);
  const n = bars.length;
  const fullWeekdaySpan = ordinal[n - 1];
  const cyclicOrdinal = new Float64Array(n * 2);
  for (let index = 0; index < n; index++) {
    cyclicOrdinal[index] = ordinal[index];
    cyclicOrdinal[index + n] = ordinal[index] + fullWeekdaySpan;
  }
  let maximum = 0;
  for (let left = 0; left < n; left++) {
    let low = left + 1;
    let high = left + n;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (cyclicOrdinal[middle] - cyclicOrdinal[left] >= 5) high = middle - 1;
      else low = middle + 1;
    }
    if (low <= left + n) maximum = Math.max(maximum, low - left);
  }
  if (maximum === 0) throw new RangeError("date sequence spans fewer than five weekdays");
  return maximum;
}

export function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const position = Math.max(0, Math.min(1, probability)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeReturnSeries(bars) {
  const returns = new Float64Array(bars.length);
  const absolutePrefix = new Float64Array(bars.length + 1);
  const signedPrefix = new Float64Array(bars.length + 1);
  for (let index = 0; index < bars.length; index++) {
    const value =
      index > 0 && bars[index].close > 0 && bars[index - 1].close > 0
        ? Math.log(bars[index].close / bars[index - 1].close)
        : 0;
    returns[index] = value;
    absolutePrefix[index + 1] = absolutePrefix[index] + Math.abs(value);
    signedPrefix[index + 1] = signedPrefix[index] + value;
  }
  return { returns, absolutePrefix, signedPrefix };
}

export function computeForwardOutcome(bars, prefixes, atr14, t, horizon) {
  if (
    !Number.isInteger(t) ||
    !Number.isInteger(horizon) ||
    t < 2401 ||
    t + horizon >= bars.length
  ) {
    throw new RangeError(
      "forward outcome requires an in-range label bar and a complete future window",
    );
  }
  const { absolutePrefix, signedPrefix } = prefixes;
  const baselineAbsSum = absolutePrefix[t] - absolutePrefix[t - 2400];
  const futureAbsSum = absolutePrefix[t + horizon + 1] - absolutePrefix[t + 1];
  const futureSignedSum = signedPrefix[t + horizon + 1] - signedPrefix[t + 1];
  const baselineMeanAbsReturn = baselineAbsSum / 2400;
  const meanFutureAbsReturn = futureAbsSum / horizon;
  const efficiency = futureAbsSum > 0 ? Math.abs(futureSignedSum) / futureAbsSum : null;
  return {
    forwardVolatilityRatio:
      baselineMeanAbsReturn > 0 ? meanFutureAbsReturn / baselineMeanAbsReturn : null,
    trendEfficiency: efficiency,
    signedReturnAtr:
      Number.isFinite(atr14) && atr14 > 0
        ? (bars[t + horizon].close - bars[t].close) / atr14
        : null,
  };
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function sampleWithoutReplacement(values, count, random) {
  if (count > values.length) throw new RangeError("sample exceeds population");
  const pool = values.slice();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function isoWeekKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const weekYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function compareStrings(a, b) {
  return a === b ? 0 : a < b ? -1 : 1;
}
