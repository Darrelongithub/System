import { METADATA_FIELDS, type Candle, type Metadata } from "./types";

export interface ParseResult {
  meta?: Metadata;
  missingMetadataField?: string;
  metadataError?: string;
  candles: Candle[];
  totalRows: number;
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.replace(/[%\s]/g, "");
  if (cleaned === "") return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "") return undefined;
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return undefined;
}

function refs(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "[]") return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((r) => String(r).trim()).filter(Boolean);
  } catch {
    /* fall through to delimiter split */
  }
  return trimmed
    .replace(/^\[|\]$/g, "")
    .split(/[;|]/)
    .map((r) => r.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

const DEFAULT_MARKERS = ["===", "---", "###", "***", "~~~"];

/**
 * Reads the generator's `section_marker_convention` text and pulls out the literal
 * marker tokens it documents (any run of 2+ symbol characters). Falls back to the
 * common markers when the field is absent or purely descriptive.
 */
export function sectionMarkers(convention: string | undefined): string[] {
  const found = convention ? (convention.match(/[=\-#*~_+>|]{2,}/g) ?? []) : [];
  const tokens = [...new Set(found)].filter((t) => t.length >= 2);
  return tokens.length > 0 ? tokens : DEFAULT_MARKERS;
}

/** True when a raw CSV line is a section/day divider rather than a candle row. */
export function isDividerLine(line: string, cells: string[], markers: string[]): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  const first = (cells[0] ?? "").trim();
  for (const marker of markers) {
    if (trimmed.startsWith(marker) || trimmed.endsWith(marker) || first.startsWith(marker)) {
      return true;
    }
  }
  // Do not infer that a non-numeric row is a divider. A malformed candle row
  // must remain visible to validation so bad market data cannot disappear.
  return false;
}

/**
 * First non-empty line carries the JSON metadata header. It may be prefixed with
 * arbitrary text (e.g. `# metadata: `), so we parse from the first `{` onwards.
 */
export function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { candles: [], totalRows: 0, metadataError: "INVALID FILE: file is empty" };
  }

  let metaRaw: Record<string, unknown> = {};
  try {
    const firstLine = lines[0]!;
    const braceIndex = firstLine.indexOf("{");
    if (braceIndex === -1) throw new Error("no json object on metadata line");
    const first = firstLine.slice(braceIndex).trim();
    const parsed: unknown = JSON.parse(first);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not object");
    metaRaw = parsed as Record<string, unknown>;
  } catch {
    return {
      candles: [],
      totalRows: 0,
      metadataError: "INVALID FILE: metadata header line is not valid JSON",
    };
  }

  for (const field of METADATA_FIELDS) {
    const value = metaRaw[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      return {
        candles: [],
        totalRows: 0,
        missingMetadataField: field,
        metadataError: `INVALID FILE: missing metadata field ${field}`,
      };
    }
  }

  const sectionConvention =
    metaRaw["section_marker_convention"] === undefined ||
    metaRaw["section_marker_convention"] === null
      ? undefined
      : String(metaRaw["section_marker_convention"]).trim();

  const rawTick = metaRaw["turtle_tick_size"];
  const parsedTick =
    rawTick === undefined || rawTick === null || String(rawTick).trim() === ""
      ? undefined
      : Number(rawTick);
  const meta: Metadata = {
    data_age: String(metaRaw["data_age"]).trim(),
    spread_convention: String(metaRaw["spread_convention"]).trim(),
    atr_method: String(metaRaw["atr_method"]).trim(),
    similar_swing_selection_rule: String(metaRaw["similar_swing_selection_rule"]).trim(),
    section_marker_convention: sectionConvention,
    turtle_tick_size:
      Number.isFinite(parsedTick) && parsedTick! > 0
        ? parsedTick
        : rawTick === undefined
          ? undefined
          : String(rawTick).trim(),
  };

  const markers = sectionMarkers(sectionConvention);

  const header = splitCsvLine(lines[1] ?? "").map((h) => h.toLowerCase());
  const candles: Candle[] = [];

  for (let l = 2; l < lines.length; l++) {
    const cells = splitCsvLine(lines[l]!);
    // Section/day dividers are not data — detected via section_marker_convention
    // when present, with a marker/no-numeric-cells fallback otherwise.
    if (isDividerLine(lines[l]!, cells, markers)) continue;
    const raw: Record<string, string> = {};
    header.forEach((key, idx) => {
      raw[key] = cells[idx] ?? "";
    });
    const index = candles.length;
    const candle: Candle = {
      index,
      datetime: raw["datetime"] ?? "",
      open: num(raw["open"]),
      high: num(raw["high"]),
      low: num(raw["low"]),
      close: num(raw["close"]),
      direction: raw["direction"] || undefined,
      body: num(raw["body"]),
      upperWick: num(raw["upper_wick"]),
      lowerWick: num(raw["lower_wick"]),
      range: num(raw["range"]),
      bodyPercentOfRange: num(raw["body_percent_of_range"]),
      upperWickPct: num(raw["upper_wick_pct"]),
      lowerWickPct: num(raw["lower_wick_pct"]),
      displacement: raw["displacement"] || undefined,
      isReliable: bool(raw["is_reliable"]),
      localAvgRange: num(raw["local_avg_range"]),
      session: (raw["session"] || "").toLowerCase() || undefined,
      atr30m: num(raw["atr_30m"]),
      similarSwingRetracePct: num(raw["similar_swing_retrace_pct"]),
      similarSwingContinuedPct: num(raw["similar_swing_continued_pct"]),
      similarSwingRefs: refs(raw["similar_swing_refs"]),
      unresolvedRefs: [],
      swingInvalidated: bool(raw["swing_invalidated"]),
      reliableStreakLength: num(raw["reliable_streak_length"]),
      trend: "ranging",
      htfTrend: { h1: "ranging", h4: "ranging", d1: "ranging" },
      raw,
    };

    const coreMissing: string[] = [];
    if (!candle.datetime.trim()) coreMissing.push("datetime");
    else if (!isValidEATDatetime(candle.datetime))
      candle.invalid = "INVALID: malformed or timezone-bearing datetime";
    if (candle.open === undefined) coreMissing.push("open");
    if (candle.high === undefined) coreMissing.push("high");
    if (candle.low === undefined) coreMissing.push("low");
    if (candle.close === undefined) coreMissing.push("close");
    if (candle.isReliable === undefined) coreMissing.push("is_reliable");
    if (coreMissing.length > 0 && !candle.invalid) {
      candle.invalid = "INVALID: missing core fields";
    } else if (!candle.invalid) {
      // Geometry / domain checks — silent acceptance of impossible OHLC produces garbage indicators.
      const o = candle.open!;
      const h = candle.high!;
      const l = candle.low!;
      const c = candle.close!;
      if (!(h >= l)) {
        candle.invalid = "INVALID: high < low";
      } else if (c > h || c < l) {
        candle.invalid = "INVALID: close outside high/low";
      } else if (o > h || o < l) {
        candle.invalid = "INVALID: open outside high/low";
      } else if (o <= 0 || h <= 0 || l <= 0 || c <= 0) {
        candle.invalid = "INVALID: non-positive price";
      }
    }

    candles.push(candle);
  }

  // Duplicate timestamps: keep the first; mark later siblings invalid so they
  // never enter indicator/strategy evaluation as if they were distinct bars.
  const seenDatetime = new Map<string, number>();
  for (const candle of candles) {
    if (candle.invalid) continue;
    const prev = seenDatetime.get(candle.datetime);
    if (prev !== undefined) {
      candle.invalid = `INVALID: duplicate datetime (first at index ${prev})`;
    } else {
      seenDatetime.set(candle.datetime, candle.index);
    }
  }

  return { meta, candles, totalRows: candles.length };
}

/** Extracts a numeric spread from the free-text spread_convention value. */
export function parseSpread(convention: string): number {
  // Numbers adjacent to letters (e.g. a symbol like "US30") are never prices.
  const matches = Array.from(convention.matchAll(/(?<![A-Za-z0-9.])-?\d+(\.\d+)?(?![A-Za-z0-9])/g));
  if (matches.length === 0) return Number.NaN;
  // Prefer the first number that is NOT itself denominated in pips. Generator
  // templates write the value in price units followed by an approximate pip
  // count (e.g. "0.0002 price units (approximately 2 pips)"); converting that
  // price-unit value by 1e-4 just because the word "pip" appears later in the
  // string shrinks the modeled spread by four orders of magnitude. Only when
  // every number is pip-qualified do we apply the pip conversion.
  const isPipQualified = (m: RegExpMatchArray): boolean =>
    /^\s*pips?\b/i.test(convention.slice((m.index ?? 0) + m[0].length));
  const priceUnit = matches.find((m) => !isPipQualified(m));
  const chosen = priceUnit ?? matches[0]!;
  const value = Number(chosen[0]);
  if (!Number.isFinite(value) || value < 0) return Number.NaN;
  return priceUnit ? value : value * 0.0001;
}

/** Source OHLC timestamps are EAT wall-clock values; explicit timezone offsets are rejected. */
export function isValidEATDatetime(value: string): boolean {
  const normalized = value.trim().replace(" ", "T");
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
  );
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millis = Number((match[7] ?? "0").padEnd(3, "0"));
  if (hour > 23 || minute > 59 || second > 59) return false;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second, millis) - 3 * 60 * 60 * 1000;
  if (!Number.isFinite(ms)) return false;
  const eat = new Date(ms + 3 * 60 * 60 * 1000);
  return (
    eat.getUTCFullYear() === year &&
    eat.getUTCMonth() === month - 1 &&
    eat.getUTCDate() === day &&
    eat.getUTCHours() === hour &&
    eat.getUTCMinutes() === minute &&
    eat.getUTCSeconds() === second &&
    eat.getUTCMilliseconds() === millis
  );
}
