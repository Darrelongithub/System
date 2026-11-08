#!/usr/bin/env node
/**
 * Single-use A8 Stage 4 driver. Import-only execution is side-effect free;
 * a real run requires the explicit --real-run switch. --dry-run writes only
 * the two isolated stage4-dry inspection files and never invokes verifyReal.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { num, splitLine } from "./lib/csv.mjs";
import {
  MAP,
  EXIT_HARNESS,
  CLAIM_CRITERIA,
  ROLES,
  VERDICT_STATES,
  RANDOM_BASELINE,
  SENSITIVITY_RULE,
  VERDICT_STATE_OF,
} from "./frozen.mjs";
import { CLAIM_CARDS } from "./claim-cards.draft.mjs";
import {
  buildDevPipeline,
  sweepBattery,
  SWEEP_GRID,
  CENTER_GRID_ID,
  RANDOM_BASELINE_SEED,
  RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE,
} from "./lib/dev-pipeline.mjs";
import {
  DEV_SEGMENT_RULE,
  splitDevSegments,
  eligibleEntryRange,
  m15MapForSegment,
  addMinutes,
  yearOf,
} from "./lib/dev-segments.mjs";
import { emitSignals } from "./lib/signals.mjs";
import { runBattery, verifyReal } from "./verify-claims.mjs";
import { matchedBaseline } from "./lib/verification.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const EXPECTED_FROZEN_SHA256 = "67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22";
const EXPECTED_CRITERIA_HASH = "788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6";
const EXPECTED_RAW = Object.freeze({
  "2004-2007": 39448,
  "2009-2011": 33862,
  "2013-2015": 35147,
  "2017-2018": 23465,
});
const EXPECTED_ELIGIBLE = Object.freeze({
  "2004-2007": 38352,
  "2009-2011": 32766,
  "2013-2015": 34051,
  "2017-2018": 22369,
});
const PRODUCTION_OUTPUTS = Object.freeze([
  "artifacts/map-compass/claim-verification.json",
  "artifacts/map-compass/claimed-trades.jsonl",
  "docs/G0-STAGE4-REPORT.md",
]);
const DRY_OUTPUTS = Object.freeze([
  "artifacts/map-compass/stage4-dry/claimed-trades.dry.jsonl",
  "artifacts/map-compass/stage4-dry/inspection.json",
]);
const lineError = (message) => new Error(message);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rowsOf = (text) =>
  text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));

function csvPrefix(line, count) {
  const fields = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (line[i] === "," && !quoted) {
      fields.push(splitLine(line.slice(start, i), ",")[0] ?? "");
      start = i + 1;
      if (fields.length === count) return fields;
    }
  }
  if (fields.length < count) fields.push(splitLine(line.slice(start), ",")[0] ?? "");
  return fields;
}

function parseCsvWithHeader(path, expectedHeader) {
  if (!existsSync(path)) throw lineError(`STAGE4_ABORT[INPUT_MISSING]: ${path} does not exist`);
  const lines = rowsOf(readFileSync(path, "utf8"));
  if (!lines.length) throw lineError(`STAGE4_ABORT[INPUT_SCHEMA]: ${path} is empty`);
  const header = splitLine(lines[0], ",");
  if (expectedHeader.some((field) => !header.includes(field))) {
    throw lineError(
      `STAGE4_ABORT[INPUT_SCHEMA]: ${path} is missing required columns ${expectedHeader.join(",")}`,
    );
  }
  return { header, lines: lines.slice(1) };
}

function parseFeed(path, { m30 = false } = {}) {
  const required = m30
    ? ["datetime", "open", "high", "low", "close", "volume"]
    : ["datetime", "open", "high", "low", "close"];
  const { header, lines } = parseCsvWithHeader(path, required);
  const ix = Object.fromEntries(required.map((name) => [name, header.indexOf(name)]));
  if (ix.datetime !== 0)
    throw lineError(`STAGE4_ABORT[INPUT_SCHEMA]: ${path} must begin with datetime`);
  const bars = [];
  let previous = null;
  for (let row = 0; row < lines.length; row++) {
    const datetime = csvPrefix(lines[row], 1)[0];
    const year = yearOf({ datetime });
    if (!/^\d{4}-\d\d-\d\d \d\d:\d\d(?::\d\d)?$/.test(datetime ?? "") || !Number.isInteger(year)) {
      throw lineError(
        `STAGE4_ABORT[INPUT_TIMESTAMP]: ${path} row=${row + 2} datetime=${datetime ?? ""}`,
      );
    }
    if (previous !== null && datetime <= previous) {
      throw lineError(`STAGE4_ABORT[TIMESTAMP_ORDER]: ${path} row=${row + 2} datetime=${datetime}`);
    }
    previous = datetime;
    if (!ROLES.DEV.includes(year)) {
      bars.push({ datetime });
      continue;
    }
    const fields = splitLine(lines[row], ",");
    const o = num(fields[ix.open]),
      h = num(fields[ix.high]),
      l = num(fields[ix.low]),
      c = num(fields[ix.close]);
    const v = m30 ? num(fields[ix.volume]) : 0;
    if ([o, h, l, c, v].some((value) => !Number.isFinite(value))) {
      throw lineError(`STAGE4_ABORT[INPUT_OHLCV]: ${path} row=${row + 2} datetime=${datetime}`);
    }
    bars.push({ datetime, o, h, l, c, v });
  }
  if (!bars.length) throw lineError(`STAGE4_ABORT[INPUT_SCHEMA]: ${path} has no data rows`);
  return bars;
}

function parseMapStates(path) {
  const { header, lines } = parseCsvWithHeader(path, ["datetime", "state"]);
  const dt = header.indexOf("datetime"),
    si = header.indexOf("state");
  if (dt !== 0 || si !== 1)
    throw lineError(`STAGE4_ABORT[MAP_SCHEMA]: ${path} must begin with datetime,state`);
  return lines.map((line, i) => {
    const [datetime, state] = csvPrefix(line, 2);
    if (!datetime || !state)
      throw lineError(
        `STAGE4_ABORT[MAP_SCHEMA]: ${path} row=${i + 2} is missing datetime or state`,
      );
    return { datetime, state };
  });
}

export function assertTimestampsAligned(bars, states) {
  if (bars.length !== states.length)
    throw lineError(
      `STAGE4_ABORT[MAP_ALIGNMENT]: M30 rows=${bars.length} Map rows=${states.length}`,
    );
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].datetime !== states[i].datetime) {
      throw lineError(
        `STAGE4_ABORT[MAP_ALIGNMENT]: row=${i + 1} M30=${bars[i].datetime} Map=${states[i].datetime}`,
      );
    }
    if (!ROLES.DEV.includes(yearOf(bars[i])) && states[i].state !== "EXCLUDED") {
      throw lineError(
        `STAGE4_ABORT[SEALED_MAP_STATE]: datetime=${bars[i].datetime} expected=EXCLUDED actual=${states[i].state}`,
      );
    }
  }
}

export function assertSegmentSpans(segments) {
  const expected = DEV_SEGMENT_RULE.years.map(([first, last]) => `${first}-${last}`);
  const actual = segments.map((segment) => segment.id);
  if (!isDeepStrictEqual(actual, expected)) {
    throw lineError(
      `STAGE4_ABORT[UNEXPECTED_SEGMENTS]: expected=${expected.join(",")} actual=${actual.join(",")}`,
    );
  }
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const [firstYear, lastYear] = DEV_SEGMENT_RULE.years[i];
    if (
      segment.firstYear !== firstYear ||
      segment.lastYear !== lastYear ||
      !segment.bars.length ||
      segment.bars.some((bar) => !ROLES.DEV.includes(yearOf(bar)))
    ) {
      throw lineError(
        `STAGE4_ABORT[UNEXPECTED_SEGMENTS]: segment=${segment.id} does not match DEV_SEGMENT_RULE`,
      );
    }
  }
}

export function assertCountFamilies(
  counts,
  { identitySegmentCount = DEV_SEGMENT_RULE.years.length } = {},
) {
  let expectedRawTotal = 0;
  let expectedEligibleTotal = 0;
  for (const [segmentId, expected] of Object.entries(EXPECTED_RAW)) {
    const actual = counts.rawBySegment?.[segmentId];
    if (actual !== expected)
      throw lineError(
        `STAGE4_ABORT[SEGMENT_BAR_COUNT]: segment=${segmentId} expected=${expected} actual=${actual}`,
      );
    expectedRawTotal += expected;
  }
  if (counts.rawTotal !== expectedRawTotal)
    throw lineError(
      `STAGE4_ABORT[DEV_TOTAL_BAR_COUNT]: expected=${expectedRawTotal} actual=${counts.rawTotal}`,
    );
  for (const [segmentId, expectedEligible] of Object.entries(EXPECTED_ELIGIBLE)) {
    const actual = counts.eligibleBySegment?.[segmentId];
    if (actual !== expectedEligible)
      throw lineError(
        `STAGE4_ABORT[SEGMENT_ELIGIBLE_COUNT]: segment=${segmentId} expected=${expectedEligible} actual=${actual}`,
      );
    expectedEligibleTotal += expectedEligible;
  }
  if (counts.eligibleTotal !== expectedEligibleTotal)
    throw lineError(
      `STAGE4_ABORT[DEV_TOTAL_ELIGIBLE_COUNT]: expected=${expectedEligibleTotal} actual=${counts.eligibleTotal}`,
    );
  const excludedTotal = (MAP.warmupBars + EXIT_HARNESS.maxHoldBars) * identitySegmentCount;
  if (counts.rawTotal - excludedTotal !== counts.eligibleTotal) {
    throw lineError(
      `STAGE4_ABORT[DEV_ELIGIBILITY_IDENTITY]: raw=${counts.rawTotal} excluded=${excludedTotal} eligible=${counts.eligibleTotal}`,
    );
  }
  return true;
}

export function collectAndAssertCounts(segments) {
  const rawBySegment = Object.fromEntries(
    segments.map((segment) => [segment.id, segment.bars.length]),
  );
  const eligibleBySegment = Object.fromEntries(
    segments.map((segment) => [
      segment.id,
      eligibleEntryRange(segment.bars.length, {
        warmupBars: MAP.warmupBars,
        tailBars: EXIT_HARNESS.maxHoldBars,
      }).count,
    ]),
  );
  const counts = {
    rawBySegment,
    eligibleBySegment,
    rawTotal: Object.values(rawBySegment).reduce((sum, value) => sum + value, 0),
    eligibleTotal: Object.values(eligibleBySegment).reduce((sum, value) => sum + value, 0),
  };
  assertCountFamilies(counts);
  return counts;
}

export function boundedM15ForSegments(segments, m15Bars) {
  const selected = new Map();
  for (const segment of segments) {
    const start = segment.bars[0]?.datetime;
    const end = segment.bars.at(-1)?.datetime;
    for (const bar of m15Bars) {
      if (bar.datetime >= start && bar.datetime <= end && ROLES.DEV.includes(yearOf(bar)))
        selected.set(bar.datetime, bar);
    }
  }
  return [...selected.values()].sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export function assertM15Usage(segments, m15BySegment) {
  for (const segment of segments) {
    const start = segment.bars[0]?.datetime;
    const end = segment.bars.at(-1)?.datetime;
    const pairs = m15BySegment.get(segment.id) ?? new Map();
    for (const subs of pairs.values()) {
      for (const bar of subs) {
        const year = yearOf(bar);
        if (!ROLES.DEV.includes(year) || bar.datetime < start || bar.datetime > end) {
          throw lineError(
            `STAGE4_ABORT[M15_SEALED_READ]: segment=${segment.id} datetime=${bar.datetime} year=${year}`,
          );
        }
      }
    }
  }
  return true;
}

export function m15MissingSecondCounts(segments, boundedM15) {
  const byDatetime = new Set(boundedM15.map((bar) => bar.datetime));
  const bySegment = {};
  for (const segment of segments) {
    const end = segment.bars.at(-1)?.datetime;
    bySegment[segment.id] = segment.bars.reduce((missing, bar) => {
      const second = addMinutes(bar.datetime, 15);
      return missing + (second <= end && byDatetime.has(second) ? 0 : 1);
    }, 0);
  }
  return bySegment;
}

export function assertTradeBoundaries(trades, segments) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  for (const trade of trades) {
    if (!ROLES.DEV.includes(trade.year))
      throw lineError(`STAGE4_ABORT[NON_DEV_YEAR]: trade year ${trade.year} is outside ROLES.DEV`);
    const segment = byId.get(trade.segmentId);
    const segmentLength = segment?.bars.length ?? trade.segmentLength;
    const localIndex = trade.localIndex;
    const exitIndex = trade.exitIndex;
    if (
      !segment ||
      !Number.isInteger(localIndex) ||
      !Number.isInteger(exitIndex) ||
      !Number.isInteger(trade.segmentLength) ||
      trade.segmentLength !== segment.bars.length
    ) {
      throw lineError(
        `STAGE4_ABORT[SEGMENT_CROSSING]: segment=${trade.segmentId} localIndex=${localIndex} exitIndex=${exitIndex}`,
      );
    }
    if (localIndex < MAP.warmupBars) {
      throw lineError(
        `STAGE4_ABORT[ENTRY_BEFORE_WARMUP]: segment=${trade.segmentId} localIndex=${localIndex} warmupBars=${MAP.warmupBars}`,
      );
    }
    if (localIndex + EXIT_HARNESS.maxHoldBars >= segmentLength) {
      throw lineError(
        `STAGE4_ABORT[INSUFFICIENT_SEGMENT_TAIL]: segment=${trade.segmentId} localIndex=${localIndex} segmentLength=${segmentLength} maxHoldBars=${EXIT_HARNESS.maxHoldBars}`,
      );
    }
    if (
      exitIndex > localIndex + EXIT_HARNESS.maxHoldBars ||
      exitIndex >= segmentLength ||
      exitIndex < localIndex ||
      segment.bars[localIndex]?.datetime !== trade.entryDatetime ||
      segment.bars[exitIndex]?.datetime !== trade.exitDatetime
    ) {
      throw lineError(
        `STAGE4_ABORT[SEGMENT_CROSSING]: segment=${trade.segmentId} localIndex=${localIndex} exitIndex=${exitIndex}`,
      );
    }
  }
  return true;
}

export function assertBaselineCoverage(trades, baseline) {
  for (const trade of trades) {
    const state = trade.verdictState ?? VERDICT_STATE_OF[trade.state];
    if (!VERDICT_STATES.includes(state)) continue;
    if (matchedBaseline(trade, baseline).missing) {
      throw lineError(
        `STAGE4_ABORT[NO_BASELINE]: strategyId=${trade.strategyId} state=${state} side=${trade.side} session=${trade.session} vol=${trade.vol} year=${trade.year}`,
      );
    }
  }
  return true;
}

export function assertCardCount(actual = CLAIM_CARDS.length) {
  if (actual !== 22) throw lineError(`STAGE4_ABORT[CARD_COUNT]: expected 22 cards, got ${actual}`);
}

export function assertRowCount(rows, cardCount = CLAIM_CARDS.length) {
  const expected = cardCount * 2;
  if (rows.length !== expected)
    throw lineError(
      `STAGE4_ABORT[ROW_COUNT]: expected ${expected} center rows, got ${rows.length}`,
    );
}

export function assertCriteriaHash(actual) {
  if (actual !== EXPECTED_CRITERIA_HASH)
    throw lineError(
      `STAGE4_ABORT[CRITERIA_HASH]: expected ${EXPECTED_CRITERIA_HASH}, got ${actual}`,
    );
}

export function assertFrozenHash(actual) {
  if (actual !== EXPECTED_FROZEN_SHA256)
    throw lineError(`STAGE4_ABORT[FROZEN_HASH]: expected ${EXPECTED_FROZEN_SHA256}, got ${actual}`);
}

export function assertProductionOutputsAbsent(root = ROOT) {
  for (const relative of PRODUCTION_OUTPUTS) {
    if (existsSync(join(root, relative))) {
      throw lineError(
        `STAGE4_ABORT[OUTPUT_EXISTS]: ${relative} already exists; Stage 4 is single-use`,
      );
    }
  }
}

export function assertPrecomputedRowsEqual(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw lineError(
      "STAGE4_ABORT[PRECOMPUTED_ROWS_MISMATCH]: precomputed rows differ from runBattery output",
    );
  }
  return true;
}

function guardInputArtifacts() {
  const frozenBytes = readFileSync(join(ROOT, "scripts/map-compass/frozen.mjs"));
  assertFrozenHash(sha256(frozenBytes));
  const projectionPath = join(ROOT, "artifacts/map-compass/power-projection.json");
  if (!existsSync(projectionPath))
    throw lineError(`STAGE4_ABORT[INPUT_MISSING]: ${projectionPath} does not exist`);
  const projection = JSON.parse(readFileSync(projectionPath, "utf8"));
  if (typeof projection.reportOnly?.criteriaHash !== "string")
    throw lineError("STAGE4_ABORT[CRITERIA_HASH]: expected reportOnly.criteriaHash to exist");
  assertCriteriaHash(projection.reportOnly.criteriaHash);
  assertCardCount();
  const calibrationPath = join(ROOT, "artifacts/map-compass/harness-calibration.json");
  if (!existsSync(calibrationPath))
    throw lineError(`STAGE4_ABORT[PLACEBO_MISSING]: ${calibrationPath} does not exist`);
  const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
  const placeboP95 = calibration.placebo?.p95FakeConfirms;
  if (!Number.isFinite(placeboP95))
    throw lineError("STAGE4_ABORT[PLACEBO_MISSING]: placebo.p95FakeConfirms is absent or invalid");
  return {
    frozenSha256: sha256(frozenBytes),
    criteriaHash: projection.reportOnly.criteriaHash,
    placeboP95,
  };
}

function loadInputs() {
  const norm = join(ROOT, "artifacts/map-compass/normalized");
  const bars = parseFeed(join(norm, "xauusd-m30-eat.csv"), { m30: true });
  const mapStates = parseMapStates(join(norm, "xauusd-m30-map.csv"));
  assertTimestampsAligned(bars, mapStates);
  const m15Bars = parseFeed(join(norm, "xauusd-m15-eat.csv"));
  const inputHashes = Object.fromEntries(
    ["xauusd-m30-eat.csv", "xauusd-m30-map.csv", "xauusd-m15-eat.csv"].map((name) => [
      name,
      sha256(readFileSync(join(norm, name))),
    ]),
  );
  const segments = splitDevSegments(bars, ROLES.DEV);
  assertSegmentSpans(segments);
  const counts = collectAndAssertCounts(segments);
  const boundedM15 = boundedM15ForSegments(segments, m15Bars);
  const m15BySegment = new Map(
    segments.map((segment) => [segment.id, m15MapForSegment(segment.bars, boundedM15)]),
  );
  assertM15Usage(segments, m15BySegment);
  return { bars, mapStates, m15Bars: boundedM15, segments, counts, m15BySegment, inputHashes };
}

function assertMapRecomputed(inputs, pipeline) {
  for (const mapped of pipeline.maps) {
    for (let local = 0; local < mapped.bars.length; local++) {
      const global = mapped.globalStart + local;
      const expected = mapped.states[local]?.state;
      if (inputs.mapStates[global]?.state !== expected) {
        throw lineError(
          `STAGE4_ABORT[MAP_STATE_MISMATCH]: datetime=${mapped.bars[local].datetime} source=${inputs.mapStates[global]?.state} recomputed=${expected}`,
        );
      }
    }
  }
}

function serializeTrades(trades) {
  return trades.length ? trades.map((trade) => JSON.stringify(trade)).join("\n") + "\n" : "";
}

function parseTradeBytes(bytes) {
  return bytes
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function unannotateSweepRows(rows) {
  return rows.map((row) => {
    const { sweepConfirmedCells, sweepCells, sweepConfirmedPct, ...rest } = row;
    return rest;
  });
}

function jsonWithNewline(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeExclusive(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx");
  try {
    writeFileSync(fd, bytes);
  } finally {
    closeSync(fd);
  }
}

function makeCountsReport(segments, counts, trades, m15Missing) {
  return segments.map((segment) => ({
    segment: segment.id,
    rawBars: counts.rawBySegment[segment.id],
    eligible: counts.eligibleBySegment[segment.id],
    entryRange: eligibleEntryRange(segment.bars.length, {
      warmupBars: MAP.warmupBars,
      tailBars: EXIT_HARNESS.maxHoldBars,
    }),
    trades: trades.filter((trade) => trade.segmentId === segment.id).length,
    missingSecondM15: m15Missing[segment.id],
    missingSecondM15Share: segment.bars.length ? m15Missing[segment.id] / segment.bars.length : 0,
  }));
}

export function inspectTrades({ trades, segments, m15MissingSecondBySegment, tradeBytes }) {
  const yearCounts = {};
  const heldCounts = {};
  let minEntryOffset = null,
    maxEntryOffset = null,
    minTailSlack = null,
    maxTailSlack = null;
  for (const trade of trades) {
    yearCounts[trade.year] = (yearCounts[trade.year] ?? 0) + 1;
    heldCounts[trade.barsHeld] = (heldCounts[trade.barsHeld] ?? 0) + 1;
    const entryOffset =
      trade.localIndex -
      eligibleEntryRange(trade.segmentLength, {
        warmupBars: MAP.warmupBars,
        tailBars: EXIT_HARNESS.maxHoldBars,
      }).start;
    const tailSlack = trade.segmentLength - trade.exitIndex;
    minEntryOffset = minEntryOffset === null ? entryOffset : Math.min(minEntryOffset, entryOffset);
    maxEntryOffset = maxEntryOffset === null ? entryOffset : Math.max(maxEntryOffset, entryOffset);
    minTailSlack = minTailSlack === null ? tailSlack : Math.min(minTailSlack, tailSlack);
    maxTailSlack = maxTailSlack === null ? tailSlack : Math.max(maxTailSlack, tailSlack);
  }
  const byCard = {};
  for (const card of CLAIM_CARDS) {
    const cardTrades = trades.filter((trade) => trade.strategyId === card.id);
    const byState = Object.fromEntries(
      [...VERDICT_STATES, "UNKNOWN"].map((state) => {
        const stateTrades = cardTrades.filter(
          (trade) => (trade.verdictState ?? "UNKNOWN") === state,
        );
        return [
          state,
          {
            count: stateTrades.length,
            meanNetR: stateTrades.length
              ? stateTrades.reduce((sum, trade) => sum + trade.netR, 0) / stateTrades.length
              : null,
          },
        ];
      }),
    );
    const long = cardTrades.filter((trade) => trade.side === "long").length;
    const short = cardTrades.filter((trade) => trade.side === "short").length;
    const unknown = byState.UNKNOWN.count;
    byCard[card.id] = {
      total: cardTrades.length,
      long,
      short,
      sideIdentity: long + short === cardTrades.length,
      unknown,
      unknownShare: cardTrades.length ? unknown / cardTrades.length : 0,
      unknownBaseline: "NOT_APPLICABLE",
      byVerdictState: byState,
      stateIdentity:
        byState.EFFICIENT.count + byState.CHOPPY.count + byState.UNKNOWN.count ===
        cardTrades.length,
    };
  }
  const yearTotal = Object.values(yearCounts).reduce((sum, count) => sum + count, 0);
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const eligibleRangesBySegment = Object.fromEntries(
    segments.map((segment) => [
      segment.id,
      eligibleEntryRange(segment.bars.length, {
        warmupBars: MAP.warmupBars,
        tailBars: EXIT_HARNESS.maxHoldBars,
      }),
    ]),
  );
  const outsideEligibleBySegment = Object.fromEntries(
    segments.map((segment) => {
      const range = eligibleRangesBySegment[segment.id];
      return [
        segment.id,
        trades.filter(
          (trade) =>
            trade.segmentId === segment.id &&
            (trade.localIndex < range.start || trade.localIndex >= range.endExclusive),
        ).length,
      ];
    }),
  );
  const missingSecondM15 = Object.fromEntries(
    segments.map((segment) => [
      segment.id,
      {
        count: m15MissingSecondBySegment[segment.id],
        totalM30: segment.bars.length,
        share: segment.bars.length
          ? m15MissingSecondBySegment[segment.id] / segment.bars.length
          : 0,
      },
    ]),
  );
  const totalMissingSecond = Object.values(m15MissingSecondBySegment).reduce(
    (sum, count) => sum + count,
    0,
  );
  const totalM30 = segments.reduce((sum, segment) => sum + segment.bars.length, 0);
  return {
    trades: trades.length,
    years: { ...yearCounts, TOTAL: yearTotal },
    sealedYearEntries: trades.filter((trade) => !ROLES.DEV.includes(trade.year)).length,
    eligibleEntryOffset: { min: minEntryOffset, max: maxEntryOffset },
    tailSlack: { min: minTailSlack, max: maxTailSlack },
    eligibleRangesBySegment,
    outsideEligibleBySegment,
    barsHeld: {
      distribution: heldCounts,
      max: trades.length ? Math.max(...trades.map((trade) => trade.barsHeld)) : null,
    },
    perCard: byCard,
    perSegmentMissingSecondM15: missingSecondM15,
    totalMissingSecondM15: {
      count: totalMissingSecond,
      totalM30,
      share: totalM30 ? totalMissingSecond / totalM30 : 0,
    },
    yearIdentity: yearTotal === trades.length,
    cardStateIdentities: Object.fromEntries(
      Object.entries(byCard).map(([id, value]) => [id, value.stateIdentity]),
    ),
    tradeJsonlSha256: sha256(tradeBytes),
  };
}

export function publishDryInspection({ root = ROOT, trades, segments, m15MissingSecondBySegment }) {
  const tradeBytes = serializeTrades(trades);
  const inspection = inspectTrades({ trades, segments, m15MissingSecondBySegment, tradeBytes });
  if (
    inspection.sealedYearEntries !== 0 ||
    !inspection.yearIdentity ||
    Object.values(inspection.outsideEligibleBySegment).some(Boolean) ||
    Object.values(inspection.cardStateIdentities).some((valid) => !valid)
  ) {
    throw lineError(
      "STAGE4_ABORT[DRY_INSPECTION_INTEGRITY]: dry inspection identity or isolation check failed",
    );
  }
  const tradePath = join(root, DRY_OUTPUTS[0]);
  const inspectionPath = join(root, DRY_OUTPUTS[1]);
  writeExclusive(tradePath, tradeBytes);
  writeExclusive(inspectionPath, jsonWithNewline(inspection));
  return { tradePath, inspectionPath, inspection };
}

function familySignalOverlap(pipeline) {
  const cardSets = new Map(CLAIM_CARDS.map((card) => [card.id, new Set()]));
  for (const segmentMap of pipeline.maps) {
    const states = segmentMap.states.map((item) => item.state);
    for (const card of CLAIM_CARDS) {
      for (const signal of emitSignals(segmentMap.bars, card.id, {
        states,
        start: 0,
        end: segmentMap.bars.length,
        include: "all",
      }))
        cardSets.get(card.id).add(`${segmentMap.id}:${signal.index}`);
    }
  }
  const jaccard = (a, b) => {
    if (!a.size && !b.size) return null;
    let common = 0;
    for (const key of a) if (b.has(key)) common++;
    const union = a.size + b.size - common;
    return union ? common / union : 0;
  };
  const kish = (sets) => {
    const counts = new Map();
    for (const set of sets) for (const key of set) counts.set(key, (counts.get(key) ?? 0) + 1);
    const n = [...counts.values()].reduce((sum, value) => sum + value, 0);
    const sumSquares = [...counts.values()].reduce((sum, value) => sum + value * value, 0);
    const nEffective = sumSquares ? (n * n) / sumSquares : 0;
    const overlapping = [...counts.values()]
      .filter((count) => count > 1)
      .reduce((sum, count) => sum + count, 0);
    return {
      n,
      distinctBars: counts.size,
      nEffective: +nEffective.toFixed(2),
      overlapFraction: n ? +(overlapping / n).toFixed(6) : 0,
      designEffect: nEffective ? +(n / nEffective).toFixed(4) : null,
    };
  };
  const families = [...new Set(CLAIM_CARDS.map((card) => card.family))];
  return Object.fromEntries(
    families.map((family) => {
      const cards = CLAIM_CARDS.filter((card) => card.family === family);
      const sets = cards.map((card) => cardSets.get(card.id));
      const pairs = [];
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++) {
          pairs.push({
            a: cards[i].id,
            b: cards[j].id,
            sharedBars: [...sets[i]].filter((key) => sets[j].has(key)).length,
            jaccard: jaccard(sets[i], sets[j]),
          });
        }
      return [
        family,
        {
          cardSignals: Object.fromEntries(
            cards.map((card) => [card.id, sets[cards.indexOf(card)].size]),
          ),
          pairs,
          pooled: kish(sets),
        },
      ];
    }),
  );
}

function signedTradeMeans(trades, row) {
  const direction = row.kind === "strength" ? 1 : -1;
  const pool = trades.filter(
    (trade) => trade.family === row.family && trade.verdictState === row.state,
  );
  const mean = (selector) =>
    pool.length
      ? pool.reduce((sum, trade) => sum + selector(trade) * direction, 0) / pool.length
      : null;
  return { grossR: mean((trade) => trade.grossR), costR: mean((trade) => trade.costR) };
}

function tableRows(rows, trades, kind) {
  const selected = rows.filter((row) => row.kind === kind);
  const header =
    "| card | family | verdict state | n | gross R | cost R | net R | net t | control mean | excess R | excess t | vetoes | LOYO | year concentration | verdict | sweep grade |";
  const divider = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|";
  const data = selected.map((row) => {
    const stats = row.stats;
    const signed = signedTradeMeans(trades, row);
    const fixed = (value) => (Number.isFinite(value) ? value.toFixed(4) : "—");
    const vetoes = (stats.vetoes ?? []).join(", ") || "—";
    const grade =
      row.verdict === "CONFIRMED" ? (row.stability ?? "NOT_APPLICABLE") : "NOT_APPLICABLE";
    return `| ${row.claimId} | ${row.family} | ${row.state} | ${stats.n} | ${fixed(signed.grossR)} | ${fixed(signed.costR)} | ${fixed(stats.meanNetR)} | ${fixed(stats.tNet)} | ${fixed(stats.meanNetR - (stats.excessVsRandomR ?? 0))} | ${fixed(stats.excessVsRandomR)} | ${fixed(stats.t)} | ${vetoes} | ${fixed(stats.loyoPositivePct)} | ${fixed(stats.concentration)} | ${row.verdict} | ${grade} |`;
  });
  return [header, divider, ...data].join("\n");
}

function buildReport({
  verified,
  pipeline,
  sweep,
  counts,
  provenance,
  inputs,
  trades,
  placeboP95,
}) {
  const rows = verified.rows;
  const confirmedStrengthRows = rows.filter(
    (row) => row.kind === "strength" && row.verdict === "CONFIRMED",
  );
  const confirmedStrengthFamilies = new Set(confirmedStrengthRows.map((row) => row.family));
  const confirmedWeakness = rows.filter(
    (row) => row.kind === "weakness" && row.verdict === "CONFIRMED",
  ).length;
  const byYear = Object.fromEntries(
    ROLES.DEV.map((year) => [year, inputs.bars.filter((bar) => yearOf(bar) === year).length]),
  );
  const segmentRows = makeCountsReport(
    inputs.segments,
    counts,
    trades,
    inputs.m15MissingSecondBySegment,
  );
  const perCardBook = CLAIM_CARDS.map((card) => {
    const cardTrades = trades.filter((trade) => trade.strategyId === card.id);
    const efficient = cardTrades.filter((trade) => trade.verdictState === "EFFICIENT").length;
    const choppy = cardTrades.filter((trade) => trade.verdictState === "CHOPPY").length;
    const unknown = cardTrades.filter((trade) => trade.verdictState == null).length;
    const long = cardTrades.filter((trade) => trade.side === "long").length;
    const short = cardTrades.filter((trade) => trade.side === "short").length;
    return {
      card: card.id,
      long,
      short,
      total: cardTrades.length,
      efficient,
      choppy,
      unknown,
      unknownShare: cardTrades.length ? unknown / cardTrades.length : 0,
      stateIdentity: efficient + choppy + unknown === cardTrades.length,
      sideIdentity: long + short === cardTrades.length,
      unknownBaseline: "NOT_APPLICABLE",
    };
  });
  const sweepTable = [];
  for (const row of rows) {
    for (const grid of SWEEP_GRID) {
      const cell = sweep.results
        .get(grid.id)
        ?.find((entry) => entry.claimId === row.claimId && entry.kind === row.kind);
      sweepTable.push({
        card: row.claimId,
        kind: row.kind,
        grid: grid.id,
        erCutoff: grid.erCutoff,
        atrPctileCutoff: grid.atrPctileCutoff,
        center: grid.id === CENTER_GRID_ID,
        verdict: cell?.verdict ?? "MISSING",
        confirmed: cell?.verdict === "CONFIRMED",
      });
    }
  }
  const allStats = rows.map((row) => ({ claimId: row.claimId, kind: row.kind, stats: row.stats }));
  const signalOverlap = familySignalOverlap(pipeline);
  return `# G0 Stage 4 Claim Evaluation\n\n## Provenance\n\n- Frozen SHA-256: \`${provenance.frozenSha256}\`\n- Required historical criteriaHash: \`${provenance.criteriaHash}\`\n- Input SHA-256: \`${JSON.stringify(provenance.inputHashes)}\`\n- Imported MAP: \`${JSON.stringify(MAP)}\`\n- Imported EXIT_HARNESS: \`${JSON.stringify(EXIT_HARNESS)}\`\n- Imported CLAIM_CRITERIA: \`${JSON.stringify(CLAIM_CRITERIA)}\`\n- Imported ROLES.DEV: \`${JSON.stringify(ROLES.DEV)}\`; VERDICT_STATES: \`${JSON.stringify(VERDICT_STATES)}\`\n- Imported RANDOM_BASELINE (legacy/not used): \`${JSON.stringify(RANDOM_BASELINE)}\`\n- Imported SENSITIVITY_RULE: \`${JSON.stringify(SENSITIVITY_RULE)}\`\n- Grid / center: \`${JSON.stringify(SWEEP_GRID)}\` / \`${CENTER_GRID_ID}\`\n- Random-control seed / entries per year-session-vol-side: ${RANDOM_BASELINE_SEED} / ${RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE}\n- M30 input rows by DEV year: \`${JSON.stringify(byYear)}\`; raw DEV total: ${counts.rawTotal}; timestamp-only excluded rows: ${inputs.bars.length - counts.rawTotal}. No sealed-year price entered any outcome computation: **ASSERTED**.\n- Raw/eligible per-segment and total guards: \`${JSON.stringify(segmentRows)}\`; arithmetic identity: ${counts.rawTotal} - (MAP.warmupBars + EXIT_HARNESS.maxHoldBars) * ${DEV_SEGMENT_RULE.years.length} = ${counts.eligibleTotal}.\n- Placebo p95: ${placeboP95} (synthetic-calibration figure — not a DEV result).\n\n## (i) STRENGTH\n\n${tableRows(rows, trades, "strength")}\n\n## WEAKNESS\n\n${tableRows(rows, trades, "weakness")}\n\n## (ii) Family-level count and separate weakness count\n\nConfirmed strength families: ${confirmedStrengthFamilies.size} distinct families. Confirmed weakness claims: ${confirmedWeakness}. Weakness confirmations do not count toward the strength-family number.\n\n## (iii) Strength count beside placebo p95\n\nCONFIRMED STRENGTH claims: ${confirmedStrengthRows.length}; placebo p95: ${placeboP95} (synthetic-calibration figure — not a DEV result).\n\n## (iv) Per-family signal overlap\n\n${JSON.stringify(signalOverlap, null, 2)}\n\n## (v) Per-year and leave-one-year-out detail per cell\n\n\`verifyReal\` cell years, by-year net returns, leave-one-year-out results, concentration, and LOYO positive share; nulls/missing years are preserved.\n\n\`\`\`json\n${JSON.stringify(allStats, null, 2)}\n\`\`\`\n\n## (vi) UNKNOWN entries and per-card book identities\n\nPer-card accepted-book counts (long, short, total, EFFICIENT, CHOPPY, UNKNOWN, UNKNOWN share, baseline status, and identity):\n\n| card | long | short | total | EFFICIENT | CHOPPY | UNKNOWN | UNKNOWN share | UNKNOWN baseline | side identity | state identity |\n|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|\n${perCardBook.map((card) => `| ${card.card} | ${card.long} | ${card.short} | ${card.total} | ${card.efficient} | ${card.choppy} | ${card.unknown} | ${card.unknownShare.toFixed(6)} | ${card.unknownBaseline} | ${card.sideIdentity} | ${card.stateIdentity} |`).join("\\n")}\n\n## (vii) 25-cell sweep table per card per kind\n\n| card | kind | grid | ER | ATR percentile | center | verdict | confirmed |\n|---|---|---|---:|---:|---|---|---|\n${sweepTable.map((cell) => `| ${cell.card} | ${cell.kind} | ${cell.grid} | ${cell.erCutoff} | ${cell.atrPctileCutoff} | ${cell.center ? "yes" : "no"} | ${cell.verdict} | ${cell.confirmed} |`).join("\n")}\n\nCenter grid is authoritative. Sweep grade is reported from the center row only when that center row is CONFIRMED; otherwise NOT_APPLICABLE.\n\n## (viii) Claim-versus-routing statement\n\nStage 4 measures CLAIMS, not ROUTING. It does not depend on the routing fix.\n\n## (ix) Kill-criterion evaluation\n\nThe preregistered minimum is three surviving strength families. ${confirmedStrengthFamilies.size} confirmed strength families were measured. ${confirmedStrengthFamilies.size < 3 ? "KILL CRITERION MET" : "KILL CRITERION NOT MET"}. Confirmed weakness claims do not increase this count.\n`;
}

function buildStage4Inputs({ checkProductionOutputs = true } = {}) {
  const provenance = guardInputArtifacts();
  if (checkProductionOutputs) assertProductionOutputsAbsent(ROOT);
  const loaded = loadInputs();
  provenance.inputHashes = loaded.inputHashes;
  const pipeline = buildDevPipeline({
    bars: loaded.bars.filter((bar) => ROLES.DEV.includes(yearOf(bar))),
    m15Bars: loaded.m15Bars,
    segments: loaded.segments,
    randomSeed: RANDOM_BASELINE_SEED,
    entriesPerRandomGroup: RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE,
  });
  if (!pipeline.diagnostics.noNonDevYearEntries || !pipeline.diagnostics.noSegmentBoundaryExits) {
    throw lineError(
      "STAGE4_ABORT[DEV_ONLY_ASSERTION]: pipeline DEV-only or segment-boundary diagnostic failed",
    );
  }
  assertMapRecomputed(loaded, pipeline);
  const m15MissingSecondBySegment = m15MissingSecondCounts(loaded.segments, loaded.m15Bars);
  const mapped = new Map(
    loaded.segments.map((segment) => [segment.id, m15MapForSegment(segment.bars, loaded.m15Bars)]),
  );
  assertM15Usage(loaded.segments, mapped);
  return { ...loaded, pipeline, provenance, m15MissingSecondBySegment };
}

export async function runDryInspection({ root = ROOT } = {}) {
  assertCardCount();
  const input = buildStage4Inputs({ checkProductionOutputs: false });
  const trades = input.pipeline.centerTrades;
  assertTradeBoundaries(trades, input.segments);
  const report = publishDryInspection({
    root,
    trades,
    segments: input.segments,
    m15MissingSecondBySegment: input.m15MissingSecondBySegment,
  });
  return { ...report, trades: trades.length };
}

export async function runRealStage4() {
  assertProductionOutputsAbsent(ROOT);
  const input = buildStage4Inputs();
  const pipeline = input.pipeline;
  assertCardCount();
  assertTradeBoundaries(pipeline.centerTrades, input.segments);
  assertBaselineCoverage(pipeline.centerTrades, pipeline.baseline);
  const tradesBytes = serializeTrades(pipeline.centerTrades);
  const tradesFromJsonl = parseTradeBytes(tradesBytes);
  if (!isDeepStrictEqual(tradesFromJsonl, pipeline.centerTrades))
    throw lineError("STAGE4_ABORT[JSONL_ROUNDTRIP]: serialized trades do not round-trip exactly");
  assertTradeBoundaries(tradesFromJsonl, input.segments);
  assertBaselineCoverage(tradesFromJsonl, pipeline.baseline);
  const sweep = sweepBattery(pipeline, runBattery);
  const precomputedRows = runBattery(tradesFromJsonl, {
    windowKind: "DEV",
    baseline: pipeline.baseline,
    sensitivityByClaim: sweep.sensitivityByClaim,
  });
  const centerRows = sweep.results.get(CENTER_GRID_ID);
  assertRowCount(precomputedRows);
  assertPrecomputedRowsEqual(unannotateSweepRows(centerRows), precomputedRows);
  assertPrecomputedRowsEqual(
    runBattery(tradesFromJsonl, {
      windowKind: "DEV",
      baseline: pipeline.baseline,
      sensitivityByClaim: sweep.sensitivityByClaim,
    }),
    precomputedRows,
  );
  const json = {
    generatedAt: new Date().toISOString(),
    mode: "A8_DEV_SEGMENTED_STAGE4",
    provenance: input.provenance,
    counts: input.counts,
    summary: {
      trades: pipeline.centerTrades.length,
      rows: precomputedRows.length,
      confirmed: precomputedRows.filter((row) => row.verdict === "CONFIRMED").length,
      refuted: precomputedRows.filter((row) => row.verdict === "REFUTED").length,
      inconclusive: precomputedRows.filter((row) => row.verdict === "INCONCLUSIVE").length,
    },
    rows: precomputedRows,
    segmentMetadata: pipeline.segmentMetadata,
    cardTradeSummary: pipeline.cardTradeSummary,
    diagnostics: pipeline.diagnostics,
    sweep: {
      sensitivityByClaim: sweep.sensitivityByClaim,
      informationalPctByClaim: sweep.informationalPctByClaim,
      results: Object.fromEntries([...sweep.results.entries()]),
    },
  };
  const report = buildReport({
    verified: { rows: precomputedRows },
    pipeline,
    sweep,
    counts: input.counts,
    provenance: input.provenance,
    inputs: input,
    trades: tradesFromJsonl,
    placeboP95: input.provenance.placeboP95,
  });

  // PNR is inside verifyReal. Only the trade file is created before it.
  const tradePath = join(ROOT, PRODUCTION_OUTPUTS[1]);
  writeExclusive(tradePath, tradesBytes);
  const ledgerPath = join(ROOT, "artifacts/map-compass/claim-ledger.jsonl");
  const ledgerBytesBefore = existsSync(ledgerPath) ? readFileSync(ledgerPath).length : 0;
  let verified;
  try {
    verified = verifyReal(tradePath, {
      baseline: pipeline.baseline,
      sensitivityByClaim: sweep.sensitivityByClaim,
      precomputedRows,
      a8DevOnly: true,
    });
    assertPrecomputedRowsEqual(verified.rows, precomputedRows);
  } catch (error) {
    const bytesAfter = existsSync(ledgerPath) ? readFileSync(ledgerPath).length : 0;
    if (bytesAfter > ledgerBytesBefore) {
      throw lineError(
        `${error.message}\nSTAGE4_ABORT[POST_PNR_FAILURE]: ledger append detected; publish nothing further, do not retry/delete/rewrite, preserve ledger, and mark docs/STATUS.md FAILED`,
      );
    }
    throw error;
  }
  json.summary = verified.summary;
  try {
    writeExclusive(join(ROOT, PRODUCTION_OUTPUTS[0]), jsonWithNewline(json));
    writeExclusive(join(ROOT, PRODUCTION_OUTPUTS[2]), report);
  } catch (error) {
    const bytesAfter = existsSync(ledgerPath) ? readFileSync(ledgerPath).length : 0;
    if (bytesAfter > ledgerBytesBefore) {
      throw lineError(
        `${error.message}\nSTAGE4_ABORT[POST_PNR_FAILURE]: ledger append detected; publish nothing further, do not retry/delete/rewrite, preserve ledger, and mark docs/STATUS.md FAILED`,
      );
    }
    throw error;
  }
  return verified.summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2];
  if (mode === "--dry-run") {
    runDryInspection()
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error.stack ?? error);
        process.exitCode = 1;
      });
  } else if (mode === "--real-run") {
    runRealStage4()
      .then((summary) => console.log(JSON.stringify(summary, null, 2)))
      .catch((error) => {
        console.error(error.stack ?? error);
        process.exitCode = 1;
      });
  } else {
    console.error(
      "Usage: node scripts/map-compass/a8-stage4-orchestrator.mjs --dry-run|--real-run",
    );
    process.exitCode = 2;
  }
}
