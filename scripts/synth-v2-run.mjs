import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import {
  assertPathInvariants,
  bootstrapRealIntervals,
  calibrateSourceCsv,
  checkDials,
  compareGateMetrics,
  computeMetricSet,
  generatePath,
  realWeekdayGroups,
} from "../src/lib/synth-v2/index.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = resolve(ROOT, "src/lib/synth-v2");
const SOURCE_PATH = resolve(ROOT, process.argv[2] ?? "XAUUSD_30min_2020-01-24_to_2026-10-01.csv");
const EXPECTED_SOURCE_SHA = "cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3";
const SEED_COUNT = 20;
const WEEKDAYS_PER_PATH = 120;
const BOOTSTRAP_REPLICATES = 300;
const STRUCTURAL_REPAIR_ATTEMPTS = 1;
const D1_SEEDS = Array.from({ length: 20 }, (_, index) => `synth-v2-d1-${index + 1}`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function finite(value, digits = 6) {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(digits);
}

function mdTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`),
  ].join("\n");
}

function verifyEngineParser(path) {
  const parsed = parseCsv(path.csv);
  if (parsed.metadataError || parsed.missingMetadataField) {
    throw new Error(`engine parser rejected generated CSV: ${parsed.metadataError ?? parsed.missingMetadataField}`);
  }
  if (parsed.candles.length !== path.candles.length) {
    throw new Error(`engine parser round-trip count mismatch: ${parsed.candles.length} != ${path.candles.length}`);
  }
  for (let index = 0; index < path.candles.length; index++) {
    const expected = path.candles[index];
    const actual = parsed.candles[index];
    if (
      actual.invalid ||
      actual.datetime !== expected.datetime ||
      actual.open !== expected.open ||
      actual.high !== expected.high ||
      actual.low !== expected.low ||
      actual.close !== expected.close
    ) {
      throw new Error(`engine parser changed/rejected row ${index} (${expected.datetime})`);
    }
  }
  return parsed.candles.length;
}

const G2_KEYS = [
  ["G2_abs_return_ACF_lag1", "absReturnAcf1"],
  ["G2_abs_return_ACF_lag6", "absReturnAcf6"],
  ["G2_abs_return_ACF_lag48", "absReturnAcf48"],
];

function fitJointVolatility(profile, realMetrics, bootstrap) {
  const base = profile.volatilityModel;
  const baseStationaryVariance = base.innovationSd ** 2 / Math.max(1e-9, 1 - base.persistence ** 2);
  const fitSeeds = Array.from({ length: 20 }, (_, index) => `synth-v2-vol-fit-${index + 1}`);
  const candidates = { slowPersistence: [0.8, 0.85, 0.9, 0.95], slowScale: [1.1, 1.2, 1.3, 1.4], fastVariance: [0.01, 0.02, 0.04, 0.08] };
  const target = Object.fromEntries(G2_KEYS.map(([id, key]) => [id, realMetrics[key]]));
  const intervals = Object.fromEntries(G2_KEYS.map(([id, key]) => {
    const realValue = realMetrics[key];
    const ci = bootstrap.byStatistic[id];
    const delta = Math.abs(realValue) * 0.2;
    return [id, { low: Math.min(realValue - delta, ci.low), high: Math.max(realValue + delta, ci.high) }];
  }));
  let bestFeasible;
  let bestAny;
  let candidateCount = 0;
  for (const persistence of candidates.slowPersistence) {
    for (const slowScale of candidates.slowScale) {
      for (const fastVariance of candidates.fastVariance) {
        candidateCount++;
        const candidate = structuredClone(profile);
        const fastPersistence = candidate.volatilityModel.fastPersistence;
        candidate.volatilityModel.persistence = persistence;
        candidate.volatilityModel.innovationSd = Math.sqrt(
          baseStationaryVariance * slowScale ** 2 * (1 - persistence ** 2),
        );
        candidate.volatilityModel.fastStationaryVariance = fastVariance;
        candidate.volatilityModel.fastInnovationSd = Math.sqrt(
          fastVariance * (1 - fastPersistence ** 2),
        );
        const paths = fitSeeds.map((seed) =>
          generatePath(candidate, { seed, weekdays: WEEKDAYS_PER_PATH, startDate: "2026-01-05" }),
        );
        const metrics = computeMetricSet(paths.map((path) => path.candles), candidate);
        const record = Object.fromEntries(G2_KEYS.map(([id, key]) => [id, metrics[key]]));
        const pass = G2_KEYS.every(([id]) => record[id] >= intervals[id].low && record[id] <= intervals[id].high);
        const score = G2_KEYS.reduce((sum, [id]) => {
          const width = Math.max(1e-6, intervals[id].high - intervals[id].low);
          return sum + ((record[id] - target[id]) / width) ** 2;
        }, 0);
        const result = { candidate, record, pass, score, persistence, slowScale, fastVariance };
        if (!bestAny || score < bestAny.score) bestAny = result;
        if (pass && (!bestFeasible || score < bestFeasible.score)) bestFeasible = result;
      }
    }
  }
  const chosen = bestFeasible ?? bestAny;
  Object.assign(profile.volatilityModel, chosen.candidate.volatilityModel);
  const fastVariance = profile.volatilityModel.fastStationaryVariance;
  const fastPersistence = profile.volatilityModel.fastPersistence;
  const momentRatio = profile.volatilityModel.fastAbsMomentRatio;
  const fastPrediction = (lag) => {
    const scale = momentRatio * Math.exp(-fastVariance);
    return (scale * (Math.exp(fastVariance * fastPersistence ** lag) - 1)) / (1 - scale);
  };
  const fastTarget = profile.volatilityModel.fastTargetAbsReturnAcf;
  const fastResidualFitLossAtSelectedVariance = [1, 6, 48].reduce((sum, lag) => {
    const key = `lag${lag}`;
    return sum + (fastPrediction(lag) - fastTarget[key]) ** 2;
  }, 0);
  profile.volatilityModel.fastFitLoss = fastResidualFitLossAtSelectedVariance;
  return {
    method: "deterministic 20-seed market-statistic grid fit; one slow daily log-volatility state plus a fast per-bar AR(1) log-volatility state",
    candidateCount,
    fitSeeds,
    targetAbsReturnAcf: target,
    allowedG2Intervals: intervals,
    fittedAbsReturnAcf: chosen.record,
    normalizedSquaredError: chosen.score,
    allG2FitIntervalsPassed: chosen.pass,
    selectedSlowPersistence: chosen.persistence,
    selectedSlowInnovationScale: chosen.slowScale,
    selectedFastStationaryVariance: chosen.fastVariance,
    selectedFastPersistence: chosen.candidate.volatilityModel.fastPersistence,
    fastResidualFitTarget: profile.volatilityModel.fastTargetAbsReturnAcf,
    fastResidualFitLossAtSelectedVariance,
  };
}

function constrainTrendiness(profile, bootstrap, seeds) {
  const band8 = bootstrap.byStatistic.G6_variance_ratio_8;
  const band16 = bootstrap.byStatistic.G6_variance_ratio_16;
  const raw = profile.dialBands.trendiness;
  const cache = new Map();
  const measure = (setting) => {
    if (cache.has(setting)) return cache.get(setting);
    const dials = { ...profile.defaultDials, trendiness: setting };
    const paths = seeds.map((seed) => generatePath(profile, {
      seed,
      weekdays: WEEKDAYS_PER_PATH,
      startDate: "2026-01-05",
      dials,
    }));
    const metrics = computeMetricSet(paths.map((path) => path.candles), profile);
    const result = { varianceRatio8: metrics.varianceRatio8, varianceRatio16: metrics.varianceRatio16 };
    cache.set(setting, result);
    return result;
  };
  const within = (metrics) =>
    metrics.varianceRatio8 >= band8.p10 && metrics.varianceRatio8 <= band8.p90 &&
    metrics.varianceRatio16 >= band16.p10 && metrics.varianceRatio16 <= band16.p90;
  const rawLow = measure(raw.p10);
  const rawHigh = measure(raw.p90);
  const center = measure(raw.p50);
  let lowSetting = raw.p10;
  let highSetting = raw.p90;
  let lowMetrics = rawLow;
  let highMetrics = rawHigh;
  let p50Within = within(center);
  if (p50Within && !within(rawLow)) {
    let fail = raw.p10;
    let pass = raw.p50;
    for (let iteration = 0; iteration < 12; iteration++) {
      const middle = (fail + pass) / 2;
      if (within(measure(middle))) pass = middle;
      else fail = middle;
    }
    lowSetting = pass;
    lowMetrics = measure(pass);
  }
  if (p50Within && !within(rawHigh)) {
    let pass = raw.p50;
    let fail = raw.p90;
    for (let iteration = 0; iteration < 12; iteration++) {
      const middle = (pass + fail) / 2;
      if (within(measure(middle))) pass = middle;
      else fail = middle;
    }
    highSetting = pass;
    highMetrics = measure(pass);
  }
  profile.trendinessBounds = {
    p10: lowSetting,
    p90: highSetting,
    varianceRatio8: { p10: band8.p10, p90: band8.p90 },
    varianceRatio16: { p10: band16.p10, p90: band16.p90 },
    endpointMetrics: { p10: lowMetrics, p90: highMetrics },
  };
  return {
    rawSettings: { p10: raw.p10, p50: raw.p50, p90: raw.p90 },
    constrainedSettings: { p10: lowSetting, p50: raw.p50, p90: highSetting },
    realVarianceRatioBands: { vr8: { p10: band8.p10, p90: band8.p90 }, vr16: { p10: band16.p10, p90: band16.p90 } },
    rawEndpointMetrics: { p10: rawLow, p50: center, p90: rawHigh },
    constrainedEndpointMetrics: { p10: lowMetrics, p90: highMetrics },
    endpointsWithinBand: p50Within && within(lowMetrics) && within(highMetrics),
    calibrationEvaluations: cache.size,
  };
}

const sourceText = readFileSync(SOURCE_PATH, "utf8");
const sourceSha = sha256(sourceText);
if (sourceSha !== EXPECTED_SOURCE_SHA) {
  throw new Error(`source SHA-256 mismatch: expected ${EXPECTED_SOURCE_SHA}, got ${sourceSha}`);
}
console.log(`source hash verified: ${sourceSha}`);

const profile = calibrateSourceCsv(sourceText, sourceSha);
const rawCandles = (await import("../src/lib/synth-v2/csv.ts")).parseSourceCsv(sourceText);
const realDays = realWeekdayGroups(rawCandles);
if (realDays.length < WEEKDAYS_PER_PATH) throw new Error("real source has too few weekday blocks");
const realCandles = realDays.flat();
const realMetrics = computeMetricSet([realCandles], profile);
const bootstrap = bootstrapRealIntervals(realDays, profile, BOOTSTRAP_REPLICATES, WEEKDAYS_PER_PATH);
const jointVolatilityFit = fitJointVolatility(profile, realMetrics, bootstrap);
const trendinessBoundFit = constrainTrendiness(profile, bootstrap, D1_SEEDS);

const gateSeeds = Array.from({ length: SEED_COUNT }, (_, index) => index + 1);
const syntheticPaths = [];
const seedHashes = [];
let invariantCount = 0;
let parserRows = 0;
for (const seed of gateSeeds) {
  const config = { seed, weekdays: WEEKDAYS_PER_PATH, startDate: "2026-01-05" };
  const first = generatePath(profile, config);
  assertPathInvariants(first.candles, WEEKDAYS_PER_PATH);
  const firstHash = sha256(JSON.stringify({ candles: first.candles, labels: first.labels, csv: first.csv }));
  const second = generatePath(profile, config);
  const secondHash = sha256(JSON.stringify({ candles: second.candles, labels: second.labels, csv: second.csv }));
  if (firstHash !== secondHash) throw new Error(`determinism failed for seed ${seed}`);
  parserRows += verifyEngineParser(first);
  invariantCount += first.candles.length;
  syntheticPaths.push(first.candles);
  seedHashes.push({ seed, sha256: firstHash, candleCount: first.candles.length });
  if (seed === 1) {
    writeFileSync(resolve(OUTPUT, "normal-seed-1.csv"), first.csv);
    writeFileSync(
      resolve(OUTPUT, "normal-seed-1.candles.json"),
      json({ seed, weekdays: WEEKDAYS_PER_PATH, startDate: "2026-01-05", dials: profile.defaultDials, candles: first.candles }),
    );
    writeFileSync(
      resolve(OUTPUT, "normal-seed-1.labels.json"),
      json({ seed, weekdays: WEEKDAYS_PER_PATH, startDate: "2026-01-05", dials: profile.defaultDials, labels: first.labels }),
    );
  }
}
const syntheticMetrics = computeMetricSet(syntheticPaths, profile);
const gateRows = compareGateMetrics(realMetrics, syntheticMetrics, bootstrap);
const d1 = checkDials(profile, D1_SEEDS, WEEKDAYS_PER_PATH);
const trendD1 = d1.find((row) => row.dial === "trendiness");
if (!trendD1) throw new Error("trendiness D1 result is missing");
const trendVarianceBounds = [
  ["G6_variance_ratio_8", "varianceRatio8"],
  ["G6_variance_ratio_16", "varianceRatio16"],
].map(([statistic, key]) => {
  const interval = bootstrap.byStatistic[statistic];
  if (!interval) throw new Error(`missing real-data interval for ${statistic}`);
  const rawLow = trendinessBoundFit.rawEndpointMetrics.p10[key];
  const rawHigh = trendinessBoundFit.rawEndpointMetrics.p90[key];
  const low = trendD1.nonTargetLow[statistic];
  const high = trendD1.nonTargetHigh[statistic];
  return {
    statistic,
    rawP10Setting: trendinessBoundFit.rawSettings.p10,
    rawP90Setting: trendinessBoundFit.rawSettings.p90,
    constrainedP10Setting: profile.trendinessBounds.p10,
    constrainedP90Setting: profile.trendinessBounds.p90,
    rawP10Value: rawLow,
    rawP90Value: rawHigh,
    constrainedP10Value: low,
    constrainedP90Value: high,
    realP10: interval.p10,
    realP90: interval.p90,
    rawP10Inside: rawLow >= interval.p10 && rawLow <= interval.p90,
    rawP90Inside: rawHigh >= interval.p10 && rawHigh <= interval.p90,
    constrainedP10Inside: low >= interval.p10 && low <= interval.p90,
    constrainedP90Inside: high >= interval.p10 && high <= interval.p90,
  };
});
const trendVarianceBoundPass = trendinessBoundFit.endpointsWithinBand;
const g8 = {
  invariants: { checkedBars: invariantCount, pass: invariantCount === syntheticPaths.reduce((sum, path) => sum + path.length, 0) },
  determinism: { checkedSeeds: seedHashes.length, pass: seedHashes.length === SEED_COUNT, seedHashes },
  engineCsvRoundTrip: { checkedRows: parserRows, pass: parserRows === invariantCount },
};
const gatePassed = gateRows.every((row) => row.pass) && Object.values(g8).every((row) => row.pass);
const d1Passed = d1.every((row) => row.pass);
const failedRows = gateRows.filter((row) => !row.pass);
const failedGateSummary = failedRows.map((row) => {
  const miss = row.synthetic < row.allowedLow ? row.allowedLow - row.synthetic : row.synthetic - row.allowedHigh;
  return `${row.id}: synthetic ${finite(row.synthetic, 8)} vs allowed [${finite(row.allowedLow, 8)}, ${finite(row.allowedHigh, 8)}], outside by ${finite(miss, 8)}`;
});
const failureDiagnosis = failedRows.map((row) => {
  if (row.id.startsWith("G2_abs_return_ACF_")) {
    return `the one fitted slow-plus-fast volatility structure still leaves ${row.id} outside its unchanged fixed interval; the Stage 1b one-change budget is exhausted.`;
  }
  return `${row.id} remains outside its fixed statistical tolerance after the single Stage 1b structural fit.`;
});

writeFileSync(resolve(OUTPUT, "profile.json"), json(profile));
const resultPayload = {
  generatedDate: "2026-10-03",
  sourceSha256: sourceSha,
  pathConfig: { seeds: gateSeeds, weekdays: WEEKDAYS_PER_PATH, startDate: "2026-01-05" },
  bootstrap: { method: "120-weekday moving-window bootstrap", replicates: BOOTSTRAP_REPLICATES },
  structuralRepairAttempts: STRUCTURAL_REPAIR_ATTEMPTS,
  repairHistory: [
    {
      attempt: 1,
      change: "Replaced iid intraday volatility scaling with one two-timescale log-volatility structure: slow daily AR(1) plus a fast per-bar AR(1). A deterministic market-statistic grid jointly fit slow persistence/scale and fast variance to raw absolute-return ACF at lags 1, 6, and 48; fast persistence was initialized from standardized residual absolute-return ACF.",
    },
  ],
  jointVolatilityFit,
  trendinessBoundFit,
  gateMetricAudit: "Final G2 remains the ACF of absolute raw close-to-close log returns. All fixed gate thresholds and interval construction are unchanged.",
  failureDiagnosis,
  d1NewsTargetDefinition: "fraction of bars labeled as routed to the real standardized-return tail pool; this directly measures the per-bar intensity dial rather than a separately renormalized realized-tail count.",
  trendVarianceBounds,
  trendVarianceBoundPass,
  real: realMetrics,
  synthetic: syntheticMetrics,
  gates: gateRows,
  g8,
  d1,
  summary: {
    gPass: gateRows.filter((row) => row.pass).length,
    gTotal: gateRows.length,
    g8Pass: Object.values(g8).every((row) => row.pass),
    d1Pass: d1Passed,
    trendVarianceBoundPass,
    stage1Status: gateRows.every((row) => row.pass) && Object.values(g8).every((row) => row.pass) && d1Passed && trendVarianceBoundPass ? "PASSED" : "FAIL",
  },
};
writeFileSync(resolve(OUTPUT, "gate-results.json"), json(resultPayload));

const gateTable = mdTable(
  ["Statistic", "Real", "Real bootstrap 95% CI", "Synthetic", "Tolerance", "Result"],
  gateRows.map((row) => [
    row.statistic,
    finite(row.real),
    row.bootstrapLow === undefined ? "n/a" : `${finite(row.bootstrapLow)}–${finite(row.bootstrapHigh)}`,
    finite(row.synthetic),
    row.tolerance,
    row.pass ? "PASS" : "FAIL",
  ]),
);
const g8Table = mdTable(
  ["G8 check", "Real", "Synthetic", "Tolerance", "Result"],
  [
    ["OHLC, price, timestamp and weekday invariants", `${realCandles.length} reference bars valid`, `${invariantCount} / ${invariantCount} generated bars valid`, "all generated rows valid; 120 weekdays per path", g8.invariants.pass ? "PASS" : "FAIL"],
    ["Determinism", "not applicable", `${g8.determinism.checkedSeeds} / ${SEED_COUNT} same-seed SHA-256 matches`, "byte-identical candles + labels + CSV per seed", g8.determinism.pass ? "PASS" : "FAIL"],
    ["Engine CSV parser round-trip", "not applicable", `${parserRows} / ${invariantCount} rows parsed unchanged`, "zero parser errors; exact OHLC/timestamp round-trip", g8.engineCsvRoundTrip.pass ? "PASS" : "FAIL"],
  ],
);
const d1Rows = d1.map((row) => [
  row.dial,
  row.targetStatistic,
  finite(row.lowSetting, 8),
  finite(row.highSetting, 8),
  finite(row.observedLow, 8),
  finite(row.observedHigh, 8),
  finite(row.move, 8),
  `≥ ${finite(row.requiredMove, 8)}`,
  row.pass ? "PASS" : "FAIL",
]);
const d1Table = mdTable(
  ["Dial", "Target statistic", "p10 setting", "p90 setting", "Observed low", "Observed high", "High−low", "Required move", "Result"],
  d1Rows,
);
const trendBoundTable = mdTable(
  ["Variance ratio", "Real 120-weekday p10–p90", "Raw p10 setting → value", "Raw p90 setting → value", "Constrained p10 setting → value", "Constrained p90 setting → value", "Constrained endpoints"],
  trendVarianceBounds.map((row) => [
    row.statistic,
    `${finite(row.realP10, 6)}–${finite(row.realP90, 6)}`,
    `${finite(row.rawP10Setting, 6)} → ${finite(row.rawP10Value, 6)}`,
    `${finite(row.rawP90Setting, 6)} → ${finite(row.rawP90Value, 6)}`,
    `${finite(row.constrainedP10Setting, 6)} → ${finite(row.constrainedP10Value, 6)}`,
    `${finite(row.constrainedP90Setting, 6)} → ${finite(row.constrainedP90Value, 6)}`,
    row.constrainedP10Inside && row.constrainedP90Inside ? "PASS" : "FAIL",
  ]),
);
const trendBoundDiagnosis = trendVarianceBoundPass
  ? `the raw mean-reverting endpoint was constrained from ${finite(trendVarianceBounds[0].rawP10Setting, 6)} to ${finite(profile.trendinessBounds.p10, 6)}; both bounded endpoints keep VR8 and VR16 within the real moving-window p10–p90 bands.`
  : "one or more constrained trend endpoints remain outside the real-data p10–p90 variance-ratio bands; the failure is reported without relaxing the band.";
const nonTargetText = d1
  .map((row) => {
    const changes = Object.entries(row.nonTargetChanges)
      .map(([name, delta]) => `${name}: ${delta >= 0 ? "+" : ""}${finite(delta, 5)}`)
      .join("; ");
    return `- **${row.dial}:** ${changes}`;
  })
  .join("\n");

const bandTable = mdTable(
  ["Dial", "p10", "p50 default", "p90", "Unit"],
  Object.entries(profile.dialBands).map(([name, band]) => [name, finite(band.p10, 8), finite(band.p50, 8), finite(band.p90, 8), band.unit]),
);

const preliminaryFiles = [
  "profile.json",
  "normal-seed-1.csv",
  "normal-seed-1.candles.json",
  "normal-seed-1.labels.json",
  "gate-results.json",
];
const preliminaryHashes = Object.fromEntries(
  preliminaryFiles.map((name) => [name, sha256(readFileSync(resolve(OUTPUT, name)))]),
);

const stage1Status = gateRows.every((row) => row.pass) && Object.values(g8).every((row) => row.pass) && d1Passed && trendVarianceBoundPass ? "PASSED" : "FAIL";
const jointFitTable = mdTable(
  ["Fit item", "Value"],
  [
    ["Grid candidates", jointVolatilityFit.candidateCount],
    ["Slow daily persistence", finite(jointVolatilityFit.selectedSlowPersistence, 4)],
    ["Slow log-vol stationary-scale multiplier", finite(jointVolatilityFit.selectedSlowInnovationScale, 4)],
    ["Fast per-bar persistence", finite(jointVolatilityFit.selectedFastPersistence, 4)],
    ["Fast log-vol stationary variance", finite(jointVolatilityFit.selectedFastStationaryVariance, 4)],
    ["Fit-seed G2 ACF(1/6/48)", Object.values(jointVolatilityFit.fittedAbsReturnAcf).map((value) => finite(value, 6)).join(" / ")],
  ],
);
const outOfScopeEntryStatus = ` M .env.example
 M README.md
 M docs/MT5-AUTOMATION.md
 M src/components/MT5AutomationPanel.tsx
 M src/lib/market-data.ts
 M src/lib/mt5/bridge-auth.ts
 M src/lib/mt5/engine.ts
 M src/lib/mt5/mql5-ea.ts
 M src/lib/mt5/mt5-store.ts
 M src/lib/mt5/news-filter.ts
 M src/lib/mt5/server-daemon.ts
 M src/lib/mt5/standalone-ea.ts
 M src/lib/mt5/types.ts
 M src/lib/synth/ASSUMPTIONS.md
 M src/lib/synth/INTEGRATION.md
 M src/lib/synth/README.md
 M src/lib/synth/REPORT.md
 M src/lib/synth/SHA256SUMS.txt
 M src/lib/synth/calibrate.ts
 M src/lib/synth/generate.ts
 M src/lib/synth/math.ts
 M src/lib/synth/profile-default.ts
 M src/lib/synth/profile.json
 M src/lib/synth/types.ts
 M src/lib/synth/validation-report.json
 M src/pages/MapGenerator.tsx
 M src/routes/__root.tsx
 M src/routes/api/market-data.health.ts
 M src/routes/api/market-data.ts
 M src/routes/api/mt5.bridge.ts
 M src/routes/api/mt5.ea.ts
 M src/routes/api/mt5.ts
 M tests/mt5-automation.test.mjs
 M tests/mt5-bridge-auth.test.mjs
 M tests/run.mjs
 M tests/server-env.test.mjs
 M tests/synth.test.mjs
?? AUDIT-ARENA-2026-10-01.md
?? src/components/ServerAccessPanel.tsx
?? src/lib/app-access-client.ts
?? src/lib/mt5/validation.ts
?? src/lib/server-access.ts
?? src/lib/synth/QUESTIONS.md
?? src/lib/synth/backups/phase0-synth-no-dayblock-catalog.tar.gz
?? src/lib/synth/profile-summary.ts
?? tests/mt5-routes.test.mjs
?? tests/mt5-safety.test.mjs`;
const outOfScopeCurrentStatus = ` M .env.example
 M README.md
 M docs/MT5-AUTOMATION.md
 M src/components/MT5AutomationPanel.tsx
 M src/lib/market-data.ts
 M src/lib/mt5/bridge-auth.ts
 M src/lib/mt5/engine.ts
 M src/lib/mt5/mql5-ea.ts
 M src/lib/mt5/mt5-store.ts
 M src/lib/mt5/news-filter.ts
 M src/lib/mt5/server-daemon.ts
 M src/lib/mt5/standalone-ea.ts
 M src/lib/mt5/types.ts
 M src/pages/MapGenerator.tsx
 M src/routes/__root.tsx
 M src/routes/api/market-data.health.ts
 M src/routes/api/market-data.ts
 M src/routes/api/mt5.bridge.ts
 M src/routes/api/mt5.ea.ts
 M src/routes/api/mt5.ts
 M tests/mt5-automation.test.mjs
 M tests/mt5-bridge-auth.test.mjs
 M tests/run.mjs
 M tests/server-env.test.mjs
?? AUDIT-ARENA-2026-10-01.md
?? src/components/ServerAccessPanel.tsx
?? src/lib/app-access-client.ts
?? src/lib/mt5/validation.ts
?? src/lib/server-access.ts
?? tests/mt5-routes.test.mjs
?? tests/mt5-safety.test.mjs`;
const report = `# Synth V2 — Stage 0 and Stage 1b report

Updated **2026-10-03**. Stage 1b result: **${stage1Status}**. This is an OHLC-only market-statistics generator; no planted regime paths, detector, or strategy evaluation are included.

## Data and protocol

- Input: \`${profile.sourceFile}\`; SHA-256 verified before calibration: \`${sourceSha}\`.
- All syntactically valid source OHLC rows are used, including both values of the source \`is_reliable\` flag; market returns are not filtered by a strategy or outcome column. Weekday schedule/metric paths use source EAT weekdays with at least 24 rows.
- Source timestamps are unzoned wall-clock strings. Stage 0 empirically supports fixed EAT (+03:00); bars were not shifted and the source profile was not rebuilt. The source also contains a contradictory section marker labelled UTC; see the evidence below and \`QUESTIONS.md\`.
- Normal realism run: ${SEED_COUNT} seeds × ${WEEKDAYS_PER_PATH} weekdays, fixed start date 2026-01-05. Each path samples a real weekday schedule template for the same weekday; weekend/session time gaps remain on the output calendar and their price gaps are bootstrapped from the real gap pools.
- Real-data bootstrap: ${BOOTSTRAP_REPLICATES} moving windows, each ${WEEKDAYS_PER_PATH} observed weekdays. For G1–G5 and G7, tolerance is the wider of ±20% around the full real estimate or the moving-window bootstrap 95% CI. G6 keeps its specified absolute ±0.05 tolerance.
- No strategy trades, R, P&L, or strategy configuration were read or used.

## Stage 0 — timestamp clock audit

The verified source has 79,586 parseable OHLC rows from 2020-01-24 05:00:00 to 2026-10-01 15:00:00. Among 203 Friday-to-Sunday/Monday gaps of at least 12 hours, the principal reopen was Monday 01:00 during US daylight time (151/167 reopens) and Monday 02:00 during US standard time (36/36). This is the fixed EAT pattern for the 18:00 New York weekly reopen. A broker clock tracking New York DST would keep its local reopen time constant.

For the requested weekday 12:00–16:00 stamp-clock test, mean \`|log(close_t/close_(t-1))| / (prior source ATR_30m / close_(t-1))\` peaked at 15:30 in US daylight time (1.068507, n=1,159). In standard time the 16:30 08:30-New-York release slot lies outside that strict window; the highest in-window slot was 12:00 (0.585957, n=567). The explicit boundary check found 16:30 means 0.934628 (DST) and 1.103242 (standard), showing the activity peak shift from 15:30 to 16:30 as New York changes clocks. This is an activity-timing proxy, not event attribution.

**Conclusion:** the rows are consistent with fixed EAT (UTC+3), not UTC or a New-York-following broker clock. The CSV \`data_age\` says 2026-10-01 15:00 EAT and \`generated_at\` is 12:14Z, consistent with the final 15:00 row. A section marker says \`(UTC)\`, so the source metadata conflict remains disclosed in \`QUESTIONS.md\`. No row was shifted; no profile recalibration was needed.

## Stage 1b — G2 lag-1 repair and full gates

The previous Stage 1 (\`f455643\`) had G1–G7 at 20/21, with only raw absolute-return G2 lag-1 failing at 0.163927 vs [0.179604, 0.359461]. Its trend p10 endpoint also fell below the real VR range. Stage 1b used exactly one structural change: a two-timescale volatility process, with a slow daily log-volatility AR(1) and a fast per-bar AR(1) log-volatility component. The fast persistence starts from real standardized-residual absolute-return ACF; slow persistence/scale and fast variance were jointly fit to raw G2 ACF(1/6/48) using 64 deterministic candidates and 20 separate market-statistic calibration seeds. The previous 0.88 slow-innovation shrink was not retained as a patch; the final slow parameters were refit within the same composite model.

${jointFitTable}

The real residual absolute-return ACF used to initialize the fast component was 1/6/48 = ${Object.values(profile.volatilityModel.fastTargetAbsReturnAcf).map((value) => finite(value, 6)).join(" / ")}. The grid's fitted raw G2 vector is compared with the real target in \`gate-results.json\`. No gate tolerance changed. The trend dial p10/p90 endpoints were separately constrained to the real 120-weekday VR p10–p90 bands; raw observed trend percentiles remain in \`profile.json\`, and inputs outside the constraint are labelled \`EXTRAPOLATION\`.

## Realism gate table

${gateTable}

G6 uses the fixed absolute tolerance in the prompt. All other numeric tolerances use the wider of their ±20% band and the real-data moving-window bootstrap 95% interval shown above.

**Metric definitions:** G1 is Pearson kurtosis (normal = 3) of close-to-close log returns divided by prior Wilder ATR(14)/prior close. G2 is the ACF of absolute raw close-to-close log returns at the indicated bar lags. G3 uses bar high-low divided by Wilder ATR(14), absolute body/range, and the two wick/range shares. G4 defines a time gap as a timestamp interval greater than 30 minutes; size is absolute log(open/prior close) divided by prior ATR/close. G5 sums each bar's high-low range inside each EAT block, divides by the day's sum of bar ranges, then averages shares across weekdays. G6 uses overlapping q-bar close-to-close log-return sums divided by q times one-bar variance. G7 is daily high-low divided by the median in-day Wilder ATR(14), summarized by median and p90.

### Structural repair log and stop point

- **Historical Stage 1:** two earlier repairs addressed candle-shape coupling and a uniform daily-volatility innovation shrink; the f455 report preserves those details and the raw-G2 metric audit.
- **Stage 1b, attempt 1/1:** installed the single two-timescale slow-plus-fast log-volatility structure and fit its shared parameters jointly to real raw absolute-return ACF lags 1, 6, and 48. No per-lag multipliers, per-bin patches, or tolerance changes were used.
- **Stage 1b result:** **${stage1Status}**. ${failedGateSummary.length ? `Remaining fixed-gate failure(s): ${failedGateSummary.join("; ")}. No second repair was made.` : "All 21 G1–G7 statistics, G8, the five primary D1 checks, and the constrained trend endpoints pass."}
- **Diagnosis:** ${failureDiagnosis.length ? failureDiagnosis.join("; ") : "the two-timescale volatility fit brings raw G2 into the unchanged allowed ranges; no remaining numeric gate failure."}
- D1 news-spike intensity remains measured as the fraction of bars whose labels route them to the empirical tail pool; no strategy or outcome statistic is used.

### G8 invariant, determinism, and parser checks

${g8Table}

## Calibration profile summary

The profile is based on ${profile.sourceMetrics.weekdayBars.toLocaleString()} weekday OHLC rows across ${profile.sourceMetrics.weekdayDates.toLocaleString()} source weekdays; ${profile.sourceMetrics.donorDays.toLocaleString()} days with at least 24 bars can donate a schedule. Within-day return residuals are sampled from the centered, volatility- and session-standardized real return pool; tail observations above the real |z| 97.5th percentile are separated so the news-spike-intensity dial controls their frequency. Volatility is the sum of a slow daily log-volatility AR(1) and a fast per-bar AR(1) log-volatility component. The slow component's baseline is fitted to real daily volatility; the final slow persistence/scale and fast variance are jointly fit against raw absolute-return ACF at lags 1, 6, and 48. The fast component's initial persistence is fitted to within-day standardized-residual absolute-return ACF. Bar range and upper/lower wick proportions are bootstrapped together from real candles conditional on estimated range/ATR thirds. Continuous, session, and multi-day gaps use separate empirical pools.

London and New York each have a 48-slot local half-hour seasonality profile. Their exchange-local factors are combined and normalized, so the same EAT timestamp can map to different local session slots across the independent DST transitions.

${bandTable}

The source has negative within-session daily log returns on ${(profile.sourceMetrics.dailyNegativeDriftShare * 100).toFixed(1)}% of eligible weekdays and near-flat returns on ${(profile.sourceMetrics.dailyNearFlatDriftShare * 100).toFixed(1)}% using the declared threshold ${finite(profile.sourceMetrics.nearFlatDriftThreshold, 8)}. **Caveat:** 2020–2026 is mostly a bull-market sample; down and flat drift ranges are therefore thin and should not be mistaken for a balanced long-history drift prior.

**G5 resolution:** six 4-hour EAT blocks are used instead of 24 separate hours. This is deliberate and was specified before the v2 run because the planned uses depend on session shape, not each hour's exact level.

## D1 dial checks

Each dial was varied alone while the other dials and the 20 matched seeds were held fixed. The four non-trend dials use the source p10/p90 settings. Trendiness uses the constrained endpoints; its required D1 movement remains at least half the original observed real trend p10–p90 target span.

${d1Table}

### Suggested trend-dial variance-ratio bound

Both trendiness endpoints are constrained so their 20-seed VR8/VR16 readings remain within the empirical real 120-weekday moving-window p10–p90 bands. Raw observed trend percentiles are preserved in the profile; out-of-bound user settings are allowed only with explicit \`EXTRAPOLATION\` labels. This is separate from the fixed normal-setting G6 gate.

${trendBoundTable}

**Endpoint bound:** ${trendVarianceBoundPass ? "PASS" : "FAIL"}. ${trendBoundDiagnosis}

Non-target changes (high setting minus low setting) across every reported G1–G7 statistic:

${nonTargetText}

## Assumptions and unverified items

- Stage 0 evidence supports fixed EAT timestamps; the \`(UTC)\` section-marker conflict remains a source-provenance uncertainty. The generated file follows the engine's unzoned EAT parser contract.
- Only weekday dates with at least 24 source rows provide schedule templates and daily-volatility/daily-drift observations. Incomplete/shorter weekdays and weekends are not emitted as target weekdays. Multi-day price gaps are labeled as weekend gaps; the empirical pool can include other multi-day closures.
- “News spike” is a statistical tail proxy (absolute standardized return above the real 97.5th percentile), not an economic-news calendar or event attribution.
- The trendiness band is derived from rolling 20-weekday lag-1 autocorrelation of standardized returns. This is a bounded AR(1) dial, not a statement about a strategy edge.
- Volatility and drift dial units are daily within-session market statistics; the drift dial adds a constant daily log-return shift apportioned evenly across that day's bars. The start price defaults to the real weekday median close and is separate from the five calibrated dials.
- Synthetic prices are rounded to $0.01. CSV metadata carries the parser-compatible static $0.20 spread string but no spread is applied to prices.
- Time-zone behavior uses the runtime's IANA/Intl database; the tzdata version is not pinned.
- The round-trip gate calls the engine CSV parser only. No analyzer strategy evaluation or strategy result is part of this stage.

## Out-of-scope working-tree edits

These paths were already present in \`git status --short\` at task entry; they were not edited or staged for Stage 0, Stage 1b, or Stage 2. The initial local checkout was at 5b5 while the session branch's already-pushed Stage 1 commit was f455. To continue from the requested base without overwriting worktree content, local \`HEAD\`/index was aligned to the existing remote f455 history. The legacy \`src/lib/synth/**\` and \`tests/synth.test.mjs\` changes listed at entry match the pre-existing 9748 parent of f455; no new commit in this task stages them. Remaining out-of-scope edits after aligning to f455 were:

\`\`\`text
${outOfScopeCurrentStatus}
\`\`\`

The complete pre-alignment \`git status --short\` snapshot, including the legacy paths that now match existing f455 history, was:

\`\`\`text
${outOfScopeEntryStatus}
\`\`\`

## Output hashes

The separate \`SHA256SUMS.txt\` lists SHA-256 for the report, source modules, tests, script, profile, gate results, and sample outputs. The report's own digest is in that manifest (a file cannot contain its own final digest).

${mdTable(["Output", "SHA-256"], Object.entries(preliminaryHashes).map(([name, digest]) => [name, digest]))}

## Stage result

- G1–G7 numeric gates: **${gateRows.filter((row) => row.pass).length}/${gateRows.length} PASS**.
- G8 checks: **${Object.values(g8).every((row) => row.pass) ? "PASS" : "FAIL"}**.
- D1 primary dial-movement checks: **${d1.filter((row) => row.pass).length}/${d1.length} PASS**; suggested trend-endpoint variance-ratio bound: **${trendVarianceBoundPass ? "PASS" : "FAIL"}**.
- Stage 1b structural changes: **${STRUCTURAL_REPAIR_ATTEMPTS}/1**.
- No regime plant, detector, or strategy result is reported in this Stage 1b artifact. Stage 2 is documented separately in \`STAGE2-REPORT.md\`.
`;
writeFileSync(resolve(OUTPUT, "REPORT.md"), report);

const outputFiles = [
  "src/lib/synth-v2/types.ts",
  "src/lib/synth-v2/random.ts",
  "src/lib/synth-v2/time.ts",
  "src/lib/synth-v2/csv.ts",
  "src/lib/synth-v2/calibrate.ts",
  "src/lib/synth-v2/metrics.ts",
  "src/lib/synth-v2/generate.ts",
  "src/lib/synth-v2/validation.ts",
  "src/lib/synth-v2/index.ts",
  "src/lib/synth-v2/README.md",
  "src/lib/synth-v2/QUESTIONS.md",
  "src/lib/synth-v2/profile.json",
  "src/lib/synth-v2/gate-results.json",
  "src/lib/synth-v2/normal-seed-1.csv",
  "src/lib/synth-v2/normal-seed-1.candles.json",
  "src/lib/synth-v2/normal-seed-1.labels.json",
  "src/lib/synth-v2/REPORT.md",
  "tests/synth-v2.test.mjs",
  "scripts/synth-v2-run.mjs",
];
const manifest = outputFiles
  .map((relativePath) => `${sha256(readFileSync(resolve(ROOT, relativePath)))}  ${relativePath}`)
  .join("\n");
writeFileSync(resolve(OUTPUT, "SHA256SUMS.txt"), `${manifest}\n`);

console.log(`G1-G7: ${gateRows.filter((row) => row.pass).length}/${gateRows.length} passed`);
console.log(`G8: ${Object.values(g8).every((row) => row.pass) ? "PASS" : "FAIL"}`);
console.log(`D1 primary movement checks: ${d1.filter((row) => row.pass).length}/${d1.length} passed`);
console.log(`trend endpoint VR bound: ${trendVarianceBoundPass ? "PASS" : "FAIL"}`);
console.log(`outputs: ${OUTPUT}`);
if (!gatePassed || !d1Passed || !trendVarianceBoundPass) process.exitCode = 2;
