#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectRegimes,
  resolveRegimeDetectorConfig,
} from "../src/lib/regime-detector-eval/frozen-detector/index.ts";
import {
  computeForwardOutcome,
  computeReturnSeries,
  DEFAULT_OPTIONS_SHA256,
  DETECTOR_TREE_SHA256,
  INPUT_FILE,
  INPUT_SHA256,
  LABELS,
  minimumFiveWeekdayOffset,
  parseGoldCsv,
  quantile,
  sampleWithoutReplacement,
  seededRandom,
  sha256,
  SPEC_SHA256,
  SPLITS,
  directoryTreeSha256,
} from "../src/lib/regime-detector-eval/core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const EVAL_DIR = path.join(ROOT, "src/lib/regime-detector-eval");
const HORIZONS = [48, 240];
const METRICS = ["forwardVolatilityRatio", "trendEfficiency", "signedReturnAtr"];
const METRIC_META = {
  forwardVolatilityRatio: { name: "forward_volatility_ratio", effectType: "ratio" },
  trendEfficiency: { name: "forward_trend_efficiency", effectType: "difference" },
  signedReturnAtr: { name: "signed_forward_return_atr", effectType: "difference" },
};
const BOOTSTRAP_REPLICATES = 2000;
const PLACEBO_SHIFTS = 1000;
const BOOTSTRAP_SEED = 0xb00757a9;
const PLACEBO_SEED = 0xb3c0ffee;
const CUT_SEED = 0xca05a1;
const MUTATION_SEED = 0x5eedc0de;
const PART2_CUTPOINTS = 200;
const PART2_BATCH_SIZE = 20;
const PART2_BATCH_COUNT = PART2_CUTPOINTS / PART2_BATCH_SIZE;
const phase =
  process.argv.find((argument) => argument.startsWith("--phase="))?.split("=")[1] ?? "all";
const batchArgument = process.argv.find((argument) => argument.startsWith("--part2-batch="));
const rangeStartArgument = process.argv.find((argument) =>
  argument.startsWith("--part2-range-start="),
);
const rangeCountArgument = process.argv.find((argument) =>
  argument.startsWith("--part2-range-count="),
);
const part2BatchIndex = batchArgument ? Number(batchArgument.split("=")[1]) : null;
const rangeStart = rangeStartArgument ? Number(rangeStartArgument.split("=")[1]) : null;
const rangeCount = rangeCountArgument ? Number(rangeCountArgument.split("=")[1]) : null;
const hasRange = rangeStartArgument !== undefined || rangeCountArgument !== undefined;
if (!new Set(["all", "part2", "part3"]).has(phase)) {
  throw new Error("Use --phase=part2 with a batch/range, or --phase=part3");
}
if (
  batchArgument &&
  (!Number.isInteger(part2BatchIndex) ||
    part2BatchIndex < 0 ||
    part2BatchIndex >= PART2_BATCH_COUNT)
) {
  throw new RangeError(`--part2-batch must be an integer from 0 to ${PART2_BATCH_COUNT - 1}`);
}
if (
  hasRange &&
  (!rangeStartArgument ||
    !rangeCountArgument ||
    !Number.isInteger(rangeStart) ||
    rangeStart < 0 ||
    !Number.isInteger(rangeCount) ||
    rangeCount < 1 ||
    rangeStart + rangeCount > PART2_CUTPOINTS)
) {
  throw new RangeError(
    "Part 2 range must provide valid start/count covering cutpoint ranks 0..199",
  );
}
if (
  (batchArgument && hasRange) ||
  ((phase === "all" || phase === "part2") && !batchArgument && !hasRange)
) {
  throw new Error("Run bounded Part 2 batches with scripts/regime-eval-all.mjs");
}
if ((part2BatchIndex !== null || hasRange) && phase !== "part2") {
  throw new Error("Part 2 batch/range options are only valid with --phase=part2");
}

function round(value, digits = 8) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function assertEqual(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, received ${actual}`);
}

async function verifyFrozenInputs() {
  const dataBytes = await readFile(path.join(ROOT, INPUT_FILE));
  assertEqual(sha256(dataBytes), INPUT_SHA256, "gold input SHA-256 changed; STOP");
  const snapshotHash = await directoryTreeSha256(path.join(EVAL_DIR, "frozen-detector"));
  assertEqual(snapshotHash, DETECTOR_TREE_SHA256, "frozen detector tree hash changed; STOP");
  const defaults = resolveRegimeDetectorConfig({});
  const defaultBytes = Buffer.from(JSON.stringify(defaults), "utf8");
  assertEqual(
    sha256(defaultBytes),
    DEFAULT_OPTIONS_SHA256,
    "resolved default options hash changed; STOP",
  );
  assertEqual(
    await readFile(path.join(EVAL_DIR, "frozen-default-config.json"), "utf8"),
    defaultBytes.toString("utf8"),
    "stored default-options snapshot differs from runtime defaults; STOP",
  );
  const specBytes = await readFile(path.join(EVAL_DIR, "SPEC-RD.md"));
  assertEqual(sha256(specBytes), SPEC_SHA256, "pre-registered SPEC-RD.md changed; STOP");
  const checksumFile = await readFile(path.join(EVAL_DIR, "SPEC-RD.sha256"), "utf8");
  assertEqual(checksumFile.trim().split(/\s+/)[0], SPEC_SHA256, "SPEC-RD.sha256 disagrees; STOP");
  return {
    dataBytes,
    snapshotHash,
    defaultOptionsHash: sha256(defaultBytes),
    specHash: sha256(specBytes),
  };
}

function buildScopeList(bars) {
  const first = bars[0].dateKey;
  const last = bars.at(-1).dateKey;
  const years = [...new Set(bars.map((bar) => bar.year))].sort((a, b) => a - b);
  return [
    { key: "FULL", start: first, end: last },
    ...SPLITS,
    ...years.map((year) => ({ key: `Y${year}`, start: `${year}-01-01`, end: `${year}-12-31` })),
  ];
}

function firstValidStart(bars, atr14, absolutePrefix) {
  for (let t = 2401; t < bars.length; t++) {
    const baseline = absolutePrefix[t] - absolutePrefix[t - 2400];
    if (baseline > 0 && Number.isFinite(atr14[t]) && atr14[t] > 0) return t;
  }
  throw new Error("no bar has 2,400 prior returns and a valid default ATR(14)");
}

function buildVolatilityTerciles(absPrefix, length) {
  const v240 = new Float64Array(length).fill(Number.NaN);
  for (let t = 240; t < length; t++) {
    v240[t] = (absPrefix[t + 1] - absPrefix[t - 239]) / 240;
  }
  const cache = new Map();
  function bandAt(t) {
    if (cache.has(t)) return cache.get(t);
    if (t < 2640 || !Number.isFinite(v240[t])) {
      cache.set(t, null);
      return null;
    }
    const history = Array.from(v240.slice(t - 2400, t));
    if (history.length !== 2400 || history.some((value) => !Number.isFinite(value))) {
      cache.set(t, null);
      return null;
    }
    const lowCut = quantile(history, 1 / 3);
    const highCut = quantile(history, 2 / 3);
    const current = v240[t];
    const band = current < lowCut ? "low" : current > highCut ? "high" : "middle";
    cache.set(t, band);
    return band;
  }
  return { v240, bandAt };
}

function createStartRecords(bars, labels, atr14, prefixes, t0, horizon, volBands) {
  const records = [];
  for (let t = t0; t + horizon < bars.length; t += horizon) {
    const outcome = computeForwardOutcome(bars, prefixes, atr14[t], t, horizon);
    const trailing240Net = prefixes.signedPrefix[t + 1] - prefixes.signedPrefix[t - 239];
    records.push({
      t,
      label: labels[t],
      week: isoWeekKey(bars[t].dateKey),
      dateKey: bars[t].dateKey,
      endDateKey: bars[t + horizon].dateKey,
      forwardVolatilityRatio: outcome.forwardVolatilityRatio,
      trendEfficiency: outcome.trendEfficiency,
      signedReturnAtr: outcome.signedReturnAtr,
      volBand: volBands.bandAt(t),
      trail240Sign: Math.sign(trailing240Net),
    });
  }
  return records;
}

function isoWeekKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const weekYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function recordsForScope(records, scope) {
  return records.filter(
    (record) =>
      record.dateKey >= scope.start &&
      record.dateKey <= scope.end &&
      record.endDateKey <= scope.end,
  );
}

function valuesFor(records, metric) {
  return records.map((record) => record[metric]).filter(Number.isFinite);
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function effectFor(metric, conditional, unconditional) {
  if (!Number.isFinite(conditional) || !Number.isFinite(unconditional)) return null;
  if (metric === "forwardVolatilityRatio")
    return unconditional === 0 ? null : conditional / unconditional;
  return conditional - unconditional;
}

function createSums() {
  return Object.fromEntries(METRICS.map((metric) => [metric, { sum: 0, count: 0 }]));
}

function addValue(sums, metric, value, weight) {
  if (weight <= 0 || !Number.isFinite(value)) return;
  sums[metric].sum += value * weight;
  sums[metric].count += weight;
}

function average(sums, metric) {
  const record = sums[metric];
  return record.count > 0 ? record.sum / record.count : null;
}

function emptyGroupedSums() {
  return Object.fromEntries(LABELS.map((label) => [label, createSums()]));
}

function seedForScope(_scope, _horizon) {
  // Re-seeding each cell makes every metric in the cell use the same weekly draws.
  return BOOTSTRAP_SEED;
}

function bootstrapCell(records, scope, horizon) {
  const weeks = [...new Set(records.map((record) => record.week))].sort();
  const distributions = Object.fromEntries(
    LABELS.map((label) => [label, Object.fromEntries(METRICS.map((metric) => [metric, []]))]),
  );
  const direction = [];
  if (!weeks.length) return { distributions, direction };
  const random = seededRandom(seedForScope(scope, horizon));

  for (let replicate = 0; replicate < BOOTSTRAP_REPLICATES; replicate++) {
    const weights = new Map();
    for (let sample = 0; sample < weeks.length; sample++) {
      const week = weeks[Math.floor(random() * weeks.length)];
      weights.set(week, (weights.get(week) ?? 0) + 1);
    }
    const all = createSums();
    const grouped = emptyGroupedSums();
    for (const record of records) {
      const weight = weights.get(record.week) ?? 0;
      if (weight === 0) continue;
      for (const metric of METRICS) {
        const value = record[metric];
        addValue(all, metric, value, weight);
        addValue(grouped[record.label], metric, value, weight);
      }
    }
    for (const label of LABELS) {
      for (const metric of METRICS) {
        const result = effectFor(metric, average(grouped[label], metric), average(all, metric));
        if (Number.isFinite(result)) distributions[label][metric].push(result);
      }
    }
    const bull = average(grouped["bullish-trend"], "signedReturnAtr");
    const bear = average(grouped["bearish-trend"], "signedReturnAtr");
    if (Number.isFinite(bull) && Number.isFinite(bear)) direction.push(bull - bear);
  }
  return { distributions, direction };
}

function placeboCell(records, labels, offsets) {
  const distributions = Object.fromEntries(
    LABELS.map((label) => [label, Object.fromEntries(METRICS.map((metric) => [metric, []]))]),
  );
  const direction = [];
  for (const offset of offsets) {
    const all = createSums();
    const grouped = emptyGroupedSums();
    for (const record of records) {
      const shiftedLabel = labels[(record.t + offset) % labels.length];
      for (const metric of METRICS) {
        const value = record[metric];
        addValue(all, metric, value, 1);
        addValue(grouped[shiftedLabel], metric, value, 1);
      }
    }
    for (const label of LABELS) {
      for (const metric of METRICS) {
        const result = effectFor(metric, average(grouped[label], metric), average(all, metric));
        distributions[label][metric].push(Number.isFinite(result) ? result : null);
      }
    }
    const bull = average(grouped["bullish-trend"], "signedReturnAtr");
    const bear = average(grouped["bearish-trend"], "signedReturnAtr");
    direction.push(Number.isFinite(bull) && Number.isFinite(bear) ? bull - bear : null);
  }
  return { distributions, direction };
}

function summarizeEffect(observed, bootstrapValues, placeboValues) {
  const low = quantile(bootstrapValues, 0.025);
  const high = quantile(bootstrapValues, 0.975);
  const finitePlaceboValues = placeboValues.filter(Number.isFinite);
  const p05 = quantile(finitePlaceboValues, 0.05);
  const p95 = quantile(finitePlaceboValues, 0.95);
  const percentileRank =
    Number.isFinite(observed) && finitePlaceboValues.length
      ? (100 * finitePlaceboValues.filter((value) => value <= observed).length) /
        finitePlaceboValues.length
      : null;
  return {
    ci95: [round(low), round(high)],
    bootstrapValidReplicates: bootstrapValues.length,
    b3P05: round(p05),
    b3P95: round(p95),
    b3ObservedPercentile: round(percentileRank, 4),
    b3FiniteShifts: finitePlaceboValues.length,
  };
}

function b2Comparators(records) {
  const allVol = mean(valuesFor(records, "forwardVolatilityRatio"));
  const low = records.filter((record) => record.volBand === "low");
  const high = records.filter((record) => record.volBand === "high");
  const lowVolMean = mean(valuesFor(low, "forwardVolatilityRatio"));
  const highVolMean = mean(valuesFor(high, "forwardVolatilityRatio"));
  const positive = records.filter((record) => record.trail240Sign > 0);
  const negative = records.filter((record) => record.trail240Sign < 0);
  const positiveMean = mean(valuesFor(positive, "signedReturnAtr"));
  const negativeMean = mean(valuesFor(negative, "signedReturnAtr"));
  return {
    volatilityTerciles: {
      low: {
        n: low.filter((record) => Number.isFinite(record.forwardVolatilityRatio)).length,
        mean: round(lowVolMean),
        effectVsB1: round(effectFor("forwardVolatilityRatio", lowVolMean, allVol)),
      },
      high: {
        n: high.filter((record) => Number.isFinite(record.forwardVolatilityRatio)).length,
        mean: round(highVolMean),
        effectVsB1: round(effectFor("forwardVolatilityRatio", highVolMean, allVol)),
      },
    },
    directionSign: {
      positiveN: positive.filter((record) => Number.isFinite(record.signedReturnAtr)).length,
      negativeN: negative.filter((record) => Number.isFinite(record.signedReturnAtr)).length,
      positiveMean: round(positiveMean),
      negativeMean: round(negativeMean),
      positiveMinusNegative: round(
        Number.isFinite(positiveMean) && Number.isFinite(negativeMean)
          ? positiveMean - negativeMean
          : null,
      ),
    },
  };
}

function pointEstimate(records, metric, label) {
  const allMean = mean(valuesFor(records, metric));
  const selected = records.filter((record) => record.label === label);
  const groupValues = valuesFor(selected, metric);
  const conditionalMean = mean(groupValues);
  return {
    n: groupValues.length,
    conditionalMean,
    unconditionalMean: allMean,
    effect: effectFor(metric, conditionalMean, allMean),
  };
}

function buildCellRows(scopedRecords, scope, horizon, boot, placebo, b2) {
  const rows = [];
  for (const label of LABELS) {
    for (const metric of METRICS) {
      const estimate = pointEstimate(scopedRecords, metric, label);
      const bootValues = boot.distributions[label][metric];
      const placeboValues = placebo.distributions[label][metric];
      const summary = summarizeEffect(estimate.effect, bootValues, placeboValues);
      rows.push({
        scope: scope.key,
        start: scope.start,
        end: scope.end,
        horizon,
        label,
        metric: METRIC_META[metric].name,
        n: estimate.n,
        conditionalMean: round(estimate.conditionalMean),
        b1UnconditionalMean: round(estimate.unconditionalMean),
        effect: round(estimate.effect),
        ci95: summary.ci95,
        bootstrapValidReplicates: summary.bootstrapValidReplicates,
        b2:
          metric === "forwardVolatilityRatio"
            ? b2.volatilityTerciles
            : metric === "signedReturnAtr"
              ? b2.directionSign
              : null,
        b3P05: summary.b3P05,
        b3P95: summary.b3P95,
        b3ObservedPercentile: summary.b3ObservedPercentile,
        b3FiniteShifts: summary.b3FiniteShifts,
        b3NullEffects: placeboValues,
        verdict: "DESCRIPTIVE-ONLY",
        sampleFlag: estimate.n < 200 ? "THIN" : "OK",
      });
    }
  }
  const bull = mean(
    valuesFor(
      scopedRecords.filter((record) => record.label === "bullish-trend"),
      "signedReturnAtr",
    ),
  );
  const bear = mean(
    valuesFor(
      scopedRecords.filter((record) => record.label === "bearish-trend"),
      "signedReturnAtr",
    ),
  );
  const contrast = Number.isFinite(bull) && Number.isFinite(bear) ? bull - bear : null;
  const nBull = valuesFor(
    scopedRecords.filter((record) => record.label === "bullish-trend"),
    "signedReturnAtr",
  ).length;
  const nBear = valuesFor(
    scopedRecords.filter((record) => record.label === "bearish-trend"),
    "signedReturnAtr",
  ).length;
  const directionBootstrap = boot.direction;
  const directionPlacebo = placebo.direction;
  const directionSummary = summarizeEffect(contrast, directionBootstrap, directionPlacebo);
  rows.push({
    scope: scope.key,
    start: scope.start,
    end: scope.end,
    horizon,
    label: "bullish-minus-bearish",
    metric: "bullish_minus_bearish_signed_return_atr",
    n: Math.min(nBull, nBear),
    nBull,
    nBear,
    conditionalMean: round(contrast),
    b1UnconditionalMean: 0,
    effect: round(contrast),
    ci95: directionSummary.ci95,
    bootstrapValidReplicates: directionSummary.bootstrapValidReplicates,
    b2: b2.directionSign,
    b3P05: directionSummary.b3P05,
    b3P95: directionSummary.b3P95,
    b3ObservedPercentile: directionSummary.b3ObservedPercentile,
    b3FiniteShifts: directionSummary.b3FiniteShifts,
    b3NullEffects: directionPlacebo,
    verdict: "DESCRIPTIVE-ONLY",
    sampleFlag: Math.min(nBull, nBear) < 200 ? "THIN" : "OK",
  });
  return rows;
}

function describeDistribution(values) {
  const finite = values.filter(Number.isFinite);
  return {
    n: finite.length,
    mean: round(mean(finite)),
    p10: round(quantile(finite, 0.1)),
    p50: round(quantile(finite, 0.5)),
    p90: round(quantile(finite, 0.9)),
  };
}

function runSegments(indices, labels) {
  const segments = [];
  let currentLabel = null;
  let currentLength = 0;
  let priorIndex = -2;
  for (const index of indices) {
    const label = labels[index];
    if (label === currentLabel && index === priorIndex + 1) {
      currentLength++;
    } else {
      if (currentLabel !== null) segments.push({ label: currentLabel, bars: currentLength });
      currentLabel = label;
      currentLength = 1;
    }
    priorIndex = index;
  }
  if (currentLabel !== null) segments.push({ label: currentLabel, bars: currentLength });
  return segments;
}

function describeLabels(bars, labels, confidence) {
  const scopeDefinitions = [
    { key: "FULL", indices: bars.map((_, index) => index) },
    ...[...new Set(bars.map((bar) => bar.year))]
      .sort((a, b) => a - b)
      .map((year) => ({
        key: `Y${year}`,
        indices: bars.flatMap((bar, index) => (bar.year === year ? [index] : [])),
      })),
  ];
  return scopeDefinitions.map(({ key, indices }) => {
    const counts = Object.fromEntries(LABELS.map((label) => [label, 0]));
    const confidenceByLabel = Object.fromEntries(LABELS.map((label) => [label, []]));
    const confidenceAll = [];
    let flips = 0;
    for (let position = 0; position < indices.length; position++) {
      const index = indices[position];
      const label = labels[index];
      counts[label]++;
      confidenceByLabel[label].push(confidence[index]);
      confidenceAll.push(confidence[index]);
      if (
        position > 0 &&
        index === indices[position - 1] + 1 &&
        label !== labels[indices[position - 1]]
      )
        flips++;
    }
    const segments = runSegments(indices, labels);
    const runLengths = Object.fromEntries(
      LABELS.map((label) => {
        const lengths = segments
          .filter((segment) => segment.label === label)
          .map((segment) => segment.bars);
        return [
          label,
          {
            runCount: lengths.length,
            bars: describeDistribution(lengths),
            weekdayEquivalents: describeDistribution(lengths.map((value) => value / 48)),
          },
        ];
      }),
    );
    const total = indices.length;
    return {
      scope: key,
      bars: total,
      flips,
      flipsPer1000Bars: total ? round((flips * 1000) / total, 6) : null,
      labelCounts: counts,
      labelShares: Object.fromEntries(
        LABELS.map((label) => [label, total ? round(counts[label] / total, 8) : null]),
      ),
      transitionShare: total ? round(counts.transition / total, 8) : null,
      confidence: describeDistribution(confidenceAll),
      confidenceByLabel: Object.fromEntries(
        LABELS.map((label) => [label, describeDistribution(confidenceByLabel[label])]),
      ),
      runLengths,
    };
  });
}

function pointSignature(point) {
  return JSON.stringify([
    point.regime,
    point.candidateRegime,
    point.changed,
    point.pendingRegime,
    point.pendingBars,
    point.confidence,
    point.candidateConfidence,
  ]);
}

function makeRandomSuffix(bars, cutoff, seed) {
  const random = seededRandom(seed >>> 0);
  const mutated = bars.slice(0, cutoff + 1);
  let priorClose = bars[cutoff].close;
  for (let index = cutoff + 1; index < bars.length; index++) {
    const open = priorClose;
    const close = priorClose * Math.exp((random() - 0.5) * 0.004);
    const pad = priorClose * (0.0001 + random() * 0.0004);
    mutated.push({
      timestamp: bars[index].timestamp,
      open,
      high: Math.max(open, close) + pad,
      low: Math.min(open, close) - pad,
      close,
      volume: null,
    });
    priorClose = close;
  }
  return mutated;
}

function countPrefixMismatches(points, referenceSignatures, cutoff) {
  let mismatches = 0;
  for (let index = 0; index <= cutoff; index++) {
    if (pointSignature(points[index]) !== referenceSignatures[index]) mismatches++;
  }
  return mismatches;
}

function chooseCutpoints(barCount, t0) {
  const population = Array.from({ length: barCount - 1 - t0 }, (_, offset) => t0 + offset);
  return sampleWithoutReplacement(population, PART2_CUTPOINTS, seededRandom(CUT_SEED)).sort(
    (a, b) => a - b,
  );
}

async function runCausality(detectorBars, signatures, cutpoints) {
  let prefixMismatchBars = 0;
  let mutationMismatchBars = 0;
  let prefixMismatchCuts = 0;
  let mutationMismatchCuts = 0;
  let checks = 0;
  const started = Date.now();
  for (let position = 0; position < cutpoints.length; position++) {
    const cutoff = cutpoints[position];
    let prefixBars = detectorBars.slice(0, cutoff + 1);
    let prefixRun = detectRegimes(prefixBars);
    const prefixMismatches = countPrefixMismatches(prefixRun.points, signatures, cutoff);
    prefixMismatchBars += prefixMismatches;
    checks += cutoff + 1;
    if (prefixMismatches) prefixMismatchCuts++;
    // Drop the large prefix feature matrix before allocating the full-length mutation result.
    prefixBars = null;
    prefixRun = null;
    if (globalThis.gc) globalThis.gc();
    let mutated = makeRandomSuffix(detectorBars, cutoff, MUTATION_SEED ^ cutoff);
    let mutationRun = detectRegimes(mutated);
    const mutationMismatches = countPrefixMismatches(mutationRun.points, signatures, cutoff);
    mutationMismatchBars += mutationMismatches;
    if (mutationMismatches) mutationMismatchCuts++;
    mutated = null;
    mutationRun = null;
    if (globalThis.gc) globalThis.gc();
    if ((position + 1) % 10 === 0 || position + 1 === cutpoints.length) {
      console.error(
        `[causality] ${position + 1}/${cutpoints.length} cutoffs in batch · prefix mismatches=${prefixMismatchBars} · mutation mismatches=${mutationMismatchBars} · elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
    }
  }
  return {
    randomSeed: `0x${CUT_SEED.toString(16)}`,
    mutationSeed: `0x${MUTATION_SEED.toString(16)} ^ cutoff`,
    cutpoints,
    cutpointRange: [cutpoints[0], cutpoints.at(-1)],
    prefixChecks: checks,
    prefixMismatchBars,
    prefixMismatchCuts,
    suffixMutationMismatchBars: mutationMismatchBars,
    suffixMutationMismatchCuts: mutationMismatchCuts,
    mismatches: prefixMismatchBars + mutationMismatchBars,
    clean: prefixMismatchBars === 0 && mutationMismatchBars === 0,
    runtimeMs: Date.now() - started,
  };
}

function computePart3(bars, labels, atr14, prefixes, t0) {
  const scopes = buildScopeList(bars);
  const volBands = buildVolatilityTerciles(prefixes.absolutePrefix, bars.length);
  const offsetsNeeded = minimumFiveWeekdayOffset(bars);
  const offsetPopulation = Array.from(
    { length: bars.length - 2 * offsetsNeeded + 1 },
    (_, index) => offsetsNeeded + index,
  );
  if (offsetPopulation.length < PLACEBO_SHIFTS) {
    throw new Error(
      `only ${offsetPopulation.length} admissible placebo offsets, need ${PLACEBO_SHIFTS}`,
    );
  }
  const placeboOffsets = sampleWithoutReplacement(
    offsetPopulation,
    PLACEBO_SHIFTS,
    seededRandom(PLACEBO_SEED),
  );
  const byHorizon = {};
  for (const horizon of HORIZONS) {
    console.error(`[part3] constructing ${horizon}-bar non-overlapping windows`);
    const allRecords = createStartRecords(bars, labels, atr14, prefixes, t0, horizon, volBands);
    const scopeResults = [];
    for (const scope of scopes) {
      const records = recordsForScope(allRecords, scope);
      const boot = bootstrapCell(records, scope, horizon);
      const placebo = placeboCell(records, labels, placeboOffsets);
      const b2 = b2Comparators(records);
      scopeResults.push({
        scope,
        nStarts: records.length,
        rows: buildCellRows(records, scope, horizon, boot, placebo, b2),
      });
      console.error(`[part3] ${horizon} bars · ${scope.key}: ${records.length} starts`);
    }
    byHorizon[horizon] = scopeResults;
  }
  return {
    outcomeDefinitions: METRIC_META,
    horizons: HORIZONS,
    sampling: { firstStartIndex: t0, intervalBars: "exactly H", completeWindowRequired: true },
    placebo: {
      shifts: PLACEBO_SHIFTS,
      seed: `0x${PLACEBO_SEED.toString(16)}`,
      minWeekdayOffsetRows: offsetsNeeded,
      offsets: placeboOffsets,
      offsetsSha256: sha256(Buffer.from(placeboOffsets.join(","), "utf8")),
      uniqueOffsets: new Set(placeboOffsets).size,
      offsetRange: [Math.min(...placeboOffsets), Math.max(...placeboOffsets)],
    },
    bootstrap: {
      method: "ISO EAT week-block bootstrap",
      resamples: BOOTSTRAP_REPLICATES,
      seed: `0x${BOOTSTRAP_SEED.toString(16)}`,
      confidenceLevel: 0.95,
    },
    byHorizon,
  };
}

function flattenRows(part3) {
  return HORIZONS.flatMap((horizon) => part3.byHorizon[horizon].flatMap((cell) => cell.rows));
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value)
    ? value.join("; ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  const columns = [
    "scope",
    "start",
    "end",
    "horizon",
    "label",
    "metric",
    "n",
    "nBull",
    "nBear",
    "conditionalMean",
    "b1UnconditionalMean",
    "effect",
    "ci95",
    "bootstrapValidReplicates",
    "b2",
    "b3P05",
    "b3P95",
    "b3ObservedPercentile",
    "b3FiniteShifts",
    "verdict",
    "sampleFlag",
  ];
  return (
    [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")),
    ].join("\n") + "\n"
  );
}

async function writeJson(name, value) {
  await writeFile(path.join(EVAL_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const hashes = await verifyFrozenInputs();
  const parsed = parseGoldCsv(hashes.dataBytes.toString("utf8"));
  const bars = parsed.bars;
  const detectorBars = bars.map(({ timestamp, open, high, low, close, volume }) => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  }));
  const started = Date.now();
  console.error(
    `[data] parsed ${bars.length} OHLC bars; volume column=${parsed.hasVolume}; marker lines=${parsed.skippedDividerLines}`,
  );
  console.error(`[detector] running frozen defaults on ${bars.length} bars`);
  let full = detectRegimes(detectorBars);
  const labels = full.points.map((point) => point.regime);
  const confidence = full.points.map((point) => point.confidence);
  const atr14 = full.points.map((point) => point.features.atr[14]);
  const signatures = full.points.map(pointSignature);
  const prefixes = computeReturnSeries(detectorBars);
  const t0 = firstValidStart(detectorBars, atr14, prefixes.absolutePrefix);
  full = null;
  if (globalThis.gc) globalThis.gc();

  const dataInfo = {
    sha256: hashes.dataBytes ? INPUT_SHA256 : null,
    detectorTreeSha256: hashes.snapshotHash,
    defaultOptionsSha256: hashes.defaultOptionsHash,
    specSha256: hashes.specHash,
    bars: bars.length,
    firstTimestampEAT: bars[0].timestamp,
    lastTimestampEAT: bars.at(-1).timestamp,
    firstDateEAT: bars[0].dateKey,
    lastDateEAT: bars.at(-1).dateKey,
    csvHeader: parsed.header,
    parsedDataRows: parsed.parsedDataRows,
    skippedDocumentedSectionLines: parsed.skippedDividerLines,
    volumeAvailable: parsed.hasVolume,
    validStartIndex: t0,
    evaluationDefaults: resolveRegimeDetectorConfig({}),
  };
  const resultMeta = { dataInfo, runtimeMs: Date.now() - started };

  if (phase === "part2") {
    const allCutpoints = chooseCutpoints(detectorBars.length, t0);
    const batchStart = part2BatchIndex === null ? rangeStart : part2BatchIndex * PART2_BATCH_SIZE;
    const count = part2BatchIndex === null ? rangeCount : PART2_BATCH_SIZE;
    const cutpoints = allCutpoints.slice(batchStart, batchStart + count);
    const label =
      part2BatchIndex === null
        ? `range ${batchStart}..${batchStart + count - 1}`
        : `batch ${part2BatchIndex + 1}/${PART2_BATCH_COUNT}`;
    console.error(
      `[part2] ${label}: ${cutpoints.length} of ${PART2_CUTPOINTS} truncation/mutation checks`,
    );
    const causality = await runCausality(detectorBars, signatures, cutpoints);
    const descriptions = describeLabels(bars, labels, confidence);
    const filename =
      part2BatchIndex === null
        ? `part2-range-${String(batchStart).padStart(3, "0")}-${String(batchStart + count - 1).padStart(3, "0")}.json`
        : `part2-batch-${String(part2BatchIndex).padStart(2, "0")}.json`;
    await writeJson(filename, {
      ...resultMeta,
      batchIndex: part2BatchIndex,
      batchStart,
      batchSize: count,
      batchCount: part2BatchIndex === null ? null : PART2_BATCH_COUNT,
      totalCutpoints: PART2_CUTPOINTS,
      causality,
      descriptions,
    });
    console.error(`[part2] ${label} complete: ${causality.mismatches} mismatches`);
  }

  if (phase === "part3") {
    const part3 = computePart3(bars, labels, atr14, prefixes, t0);
    await writeJson("part3-results.json", { ...resultMeta, ...part3 });
    await writeFile(path.join(EVAL_DIR, "forward-cells.csv"), toCsv(flattenRows(part3)));
    console.error(`[part3] wrote ${flattenRows(part3).length} label/outcome/scope cells`);
  }
  console.error(`[done] phase=${phase} total-runtime-ms=${Date.now() - started}`);
}

await main();
