import type { Candle, RawCandle } from "./types";
import { formatEatDatetime, parseEatDatetime, rawCandleTime } from "./time";

function parseRecord(line: string, lineNumber: number): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i]!;
    if (quoted) {
      if (character === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"') {
      if (value.trim() !== "") throw new Error(`unexpected quote at CSV line ${lineNumber}`);
      quoted = true;
    } else if (character === ",") {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error(`unclosed quote at CSV line ${lineNumber}`);
  cells.push(value.trim());
  return cells;
}

function numericCell(value: string | undefined, name: string, lineNumber: number): number {
  if (value === undefined || value.trim() === "") throw new Error(`missing ${name} at CSV line ${lineNumber}`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid ${name} at CSV line ${lineNumber}: ${value}`);
  return number;
}

export function parseSourceCsv(text: string): RawCandle[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let headerIndex = -1;
  let header: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#") || line.startsWith("===")) continue;
    const cells = parseRecord(line, i + 1).map((cell) => cell.toLowerCase());
    if (cells.includes("datetime") && cells.includes("open") && cells.includes("high")) {
      headerIndex = i;
      header = cells;
      break;
    }
  }
  if (headerIndex < 0) throw new Error("source CSV has no OHLC header");
  const columns = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const required of ["datetime", "open", "high", "low", "close"]) {
    if (columns[required] === undefined) throw new Error(`source CSV is missing ${required}`);
  }

  const candles: RawCandle[] = [];
  let previousEpoch = Number.NEGATIVE_INFINITY;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const original = lines[i] ?? "";
    const trimmed = original.trim();
    if (!trimmed || trimmed.startsWith("===")) continue;
    const cells = parseRecord(original, i + 1);
    const rawDatetime = cells[columns["datetime"]] ?? "";
    if (rawDatetime.startsWith("===")) continue;
    const epochMs = parseEatDatetime(rawDatetime);
    if (epochMs <= previousEpoch) {
      throw new Error(`source timestamps are duplicate or out of order at line ${i + 1}: ${rawDatetime}`);
    }
    const open = numericCell(cells[columns["open"]], "open", i + 1);
    const high = numericCell(cells[columns["high"]], "high", i + 1);
    const low = numericCell(cells[columns["low"]], "low", i + 1);
    const close = numericCell(cells[columns["close"]], "close", i + 1);
    if (!(open > 0 && high > 0 && low > 0 && close > 0)) {
      throw new Error(`non-positive price at source line ${i + 1}`);
    }
    if (low > Math.min(open, close) || high < Math.max(open, close) || high < low) {
      throw new Error(`invalid OHLC geometry at source line ${i + 1}: ${rawDatetime}`);
    }
    const rawReliable = columns["is_reliable"] === undefined ? undefined : cells[columns["is_reliable"]];
    const reliable =
      rawReliable === undefined || rawReliable === ""
        ? undefined
        : rawReliable.toLowerCase() === "true"
          ? true
          : rawReliable.toLowerCase() === "false"
            ? false
            : (() => {
                throw new Error(`invalid is_reliable at source line ${i + 1}: ${rawReliable}`);
              })();
    const time = rawCandleTime(epochMs);
    candles.push({
      datetime: formatEatDatetime(epochMs),
      epochMs,
      date: time.date,
      minuteOfDay: time.minuteOfDay,
      weekday: time.weekday,
      open,
      high,
      low,
      close,
      reliable,
    });
    previousEpoch = epochMs;
  }
  if (candles.length < 1_000) throw new Error(`source CSV is unexpectedly short: ${candles.length} candles`);
  return candles;
}

export function serializeEngineCsv(candles: readonly Candle[]): string {
  if (candles.length === 0) throw new Error("cannot serialize an empty synthetic path");
  const last = candles[candles.length - 1]!;
  const metadata = {
    data_age: `${last.datetime} EAT`,
    spread_convention:
      "XAUUSD: static $0.20 per ounce parser-compatibility estimate; not calibrated and not applied to OHLC.",
    atr_method:
      "Wilder ATR(14) is computed from the generated OHLC by the consumer; no ATR column is written.",
    similar_swing_selection_rule:
      "Not generated; synth-v2 exports OHLC only and does not create strategy context.",
    section_marker_convention: "No section markers.",
    turtle_tick_size: 0.01,
  };
  const rows = [
    `# metadata: ${JSON.stringify(metadata)}`,
    "datetime,open,high,low,close,is_reliable",
    ...candles.map((candle) => {
      const epoch = parseEatDatetime(candle.datetime);
      if (formatEatDatetime(epoch) !== candle.datetime) throw new Error(`invalid output datetime ${candle.datetime}`);
      if (
        ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
        candle.low <= 0 ||
        candle.low > Math.min(candle.open, candle.close) ||
        candle.high < Math.max(candle.open, candle.close)
      ) {
        throw new Error(`invalid output OHLC at ${candle.datetime}`);
      }
      return `${candle.datetime},${candle.open.toFixed(2)},${candle.high.toFixed(2)},${candle.low.toFixed(2)},${candle.close.toFixed(2)},true`;
    }),
  ];
  return `${rows.join("\n")}\n`;
}

export { parseRecord as parseCsvRecordForTests };
