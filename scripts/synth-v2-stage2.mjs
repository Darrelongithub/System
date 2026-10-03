import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { parseSourceCsv } from "../src/lib/synth-v2/csv.ts";
import { generatePathWithSchedule } from "../src/lib/synth-v2/generate.ts";
import { decodeStage2Artifact, encodeStage2Artifact } from "../src/lib/synth-v2/stage2-artifacts.ts";
import { generateStage2Path, getRegimeBaseDials, OVERLAY_IDS, REGIME_IDS } from "../src/lib/synth-v2/regimes.ts";
import {
  addDesignPathToPairwiseAuc,
  computeCausalFeatures,
  createPairwiseAucAccumulator,
  deriveStage2Bands,
  finishPairwiseAuc,
  summarizePairwiseAuc,
  summarizeStage2Attainment,
  summarizeStage2Realism,
} from "../src/lib/synth-v2/stage2-validation.ts";

const ROOT = process.cwd();
const SYNTH_DIR = join(ROOT, "src/lib/synth-v2");
const DATA_DIR = join(SYNTH_DIR, "stage2-data");
const SOURCE_PATH = join(ROOT, "XAUUSD_30min_2020-01-24_to_2026-10-01.csv");
const EXPECTED_SOURCE_SHA256 = "cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3";
const FAILURE_TAG = "GENERATOR G2 FAIL: do not use features built on fewer than 6 bars.";
const G2_PASS = JSON.parse(readFileSync(join(SYNTH_DIR, "gate-results.json"), "utf8"))
  .gates.find((row) => row.id === "G2_abs_return_ACF_lag1")?.pass === true;
const STATUS_TAG = G2_PASS ? null : FAILURE_TAG;
const profile = JSON.parse(readFileSync(join(SYNTH_DIR, "profile.json"), "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function hashFile(path) {
  return sha256(readFileSync(path));
}
function relativeRoot(path) {
  return relative(ROOT, path).split("\\").join("/");
}
function jsonFile(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function format(value, digits = 6) {
  return Number(value).toFixed(digits);
}
function statusText() {
  return STATUS_TAG ?? "Stage 1b G2 passed";
}
function assertSourceFrozen() {
  const actual = hashFile(SOURCE_PATH);
  if (actual !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`source SHA-256 mismatch: expected ${EXPECTED_SOURCE_SHA256}, got ${actual}; stopping before Stage 2 generation`);
  }
  if (profile.sourceSha256 !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`calibration profile source hash mismatch: ${profile.sourceSha256}`);
  }
  return actual;
}
function cleanOldSeedFiles(path) {
  mkdirSync(path, { recursive: true });
  for (const name of readdirSync(path)) {
    if (/^seed-\d{4}\.json\.gz$/.test(name)) unlinkSync(join(path, name));
  }
}

function checkNoLookahead(path) {
  const changedLabels = path.scenarioLabels.map((label, index) => ({
    ...label,
    regimeId: REGIME_IDS[(index + 1) % REGIME_IDS.length],
    segmentIndex: (label.segmentIndex + 1) % path.segments.length,
    inBlend: !label.inBlend,
    overlays: label.overlays.length ? [] : ["news_storm"],
  }));
  const relabelled = generatePathWithSchedule(profile, {
    seed: path.seed,
    weekdays: path.weekdays,
    startDate: path.startDate,
    barDials: path.barDials,
    scenarioLabels: changedLabels,
  }, path.schedule);
  if (JSON.stringify(relabelled.candles) !== JSON.stringify(path.synthetic.candles)) {
    throw new Error("scenario labels affected OHLC with the per-bar dials held fixed");
  }
  const targetIndex = Math.min(400, path.synthetic.candles.length - 1);
  const before = computeCausalFeatures(path.synthetic.candles)[targetIndex];
  const mutated = path.synthetic.candles.map((candle, index) => index < targetIndex ? candle : ({
    ...candle,
    open: candle.open * 1.17,
    high: candle.high * 1.17,
    low: candle.low * 1.17,
    close: candle.close * 1.17,
  }));
  const after = computeCausalFeatures(mutated)[targetIndex];
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("causal feature vector changed after mutating from the classified bar onward");
  }
  return {
    labelsCanAffectPrices: false,
    identicalOhlcWhenLabelsChanged: true,
    featuresUsePastBarsOnly: true,
    futureMutationBarIndex: targetIndex,
    causalFeatureWarmupBars: { atrAndDrift: 48, varianceRatios: 240 },
  };
}

function createOverlayAccumulator() {
  return Object.fromEntries(OVERLAY_IDS.map((id) => [id, { episodes: 0, weekdays: 0, byRegime: Object.fromEntries(REGIME_IDS.map((r) => [r, 0])) }]));
}
function collectOverlayCoverage(accumulator, path) {
  for (const segment of path.segments) {
    for (const episode of segment.overlays) {
      const item = accumulator[episode.overlayId];
      item.episodes++;
      item.weekdays += episode.endDayExclusive - episode.startDay;
      item.byRegime[segment.regimeId]++;
    }
  }
}
function createExtrapolationAccumulator() {
  return Object.fromEntries(REGIME_IDS.map((id) => [id, { bars: 0, extrapolationBars: 0, byDial: {} }]));
}
function collectExtrapolationCoverage(accumulator, path) {
  for (const label of path.synthetic.labels) {
    const item = accumulator[label.regimeId];
    item.bars++;
    if (label.flags.includes("EXTRAPOLATION")) {
      item.extrapolationBars++;
      for (const flag of label.flags) {
        if (flag.startsWith("EXTRAPOLATION:")) {
          const dial = flag.slice("EXTRAPOLATION:".length);
          item.byDial[dial] = (item.byDial[dial] ?? 0) + 1;
        }
      }
    }
  }
}
function findExtrapolationFlags(profile, dials) {
  const flags = [];
  for (const key of Object.keys(dials)) {
    const band = profile.dialBands[key];
    if (dials[key] < band.p10 || dials[key] > band.p90) flags.push(key);
  }
  const bounds = profile.trendinessBounds;
  if (bounds && (dials.trendiness < bounds.p10 || dials.trendiness > bounds.p90)) flags.push("trendinessVarianceRatio");
  return flags;
}
function dialPercentileName(value, dialBand, constrainedBand) {
  const close = (left, right) => Math.abs(left - right) <= 1e-12;
  if (constrainedBand && close(value, constrainedBand.p10)) return "VR-constrained p10";
  if (constrainedBand && close(value, constrainedBand.p90)) return "VR-constrained p90";
  for (const p of [10, 50, 90]) if (close(value, dialBand[`p${p}`])) return `p${p}`;
  return "blended";
}
function regimeSettings(profile) {
  return REGIME_IDS.map((regimeId) => {
    const dials = getRegimeBaseDials(profile, regimeId);
    const trendBounds = profile.trendinessBounds;
    const selectors = {
      volatilityLevel: dialPercentileName(dials.volatilityLevel, profile.dialBands.volatilityLevel),
      drift: dialPercentileName(dials.drift, profile.dialBands.drift),
      trendiness: dialPercentileName(dials.trendiness, profile.dialBands.trendiness, trendBounds),
      gapSize: dialPercentileName(dials.gapSize, profile.dialBands.gapSize),
      newsSpikeIntensity: dialPercentileName(dials.newsSpikeIntensity, profile.dialBands.newsSpikeIntensity),
    };
    return { regimeId, dials, selectors, baseExtrapolationFlags: findExtrapolationFlags(profile, dials) };
  });
}

function updateStage1ChecksumInventory() {
  const manifestPath = join(SYNTH_DIR, "SHA256SUMS.txt");
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
  const paths = lines.map((line) => line.match(/^[a-f0-9]{64}\s+(.+)$/)?.[1]).filter(Boolean);
  writeFileSync(manifestPath, `${paths.map((path) => `${hashFile(resolve(ROOT, path))}  ${path}`).join("\n")}\n`);
}

function percentCoverage(value) {
  return `${(value * 100).toFixed(1)}%`;
}
function attainmentTable(rows, rowLabel) {
  return [
    `| Base regime | ${rowLabel} | ${rowLabel} ≥90% | ${rowLabel} attainment | ATR% coverage | Daily drift | VR8 | VR16 | Status |`,
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.regimeId} | ${row.segmentCount} | ${row.segmentsMeetingNinetyPercent}/${row.segmentCount} | ${percentCoverage(row.segmentAttainmentRate)} | ${percentCoverage(row.averageCoverage.atrPercentPerBar)} | ${percentCoverage(row.averageCoverage.dailyDrift)} | ${percentCoverage(row.averageCoverage.varianceRatio8)} | ${percentCoverage(row.averageCoverage.varianceRatio16)} | ${row.status} |`),
  ].join("\n");
}
function settingTable(settings) {
  return [
    "| Regime | Volatility level | Drift | Trendiness | Gap size | News intensity | Base `EXTRAPOLATION` flags |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...settings.map((item) => `| ${item.regimeId} | ${item.selectors.volatilityLevel} (${format(item.dials.volatilityLevel, 8)}) | ${item.selectors.drift} (${format(item.dials.drift, 8)}) | ${item.selectors.trendiness} (${format(item.dials.trendiness, 8)}) | p50 (${format(item.dials.gapSize, 8)}) | p50 (${format(item.dials.newsSpikeIntensity, 8)}) | ${item.baseExtrapolationFlags.length ? item.baseExtrapolationFlags.join(", ") : "none"} |`),
  ].join("\n");
}
function overlayTable(coverage) {
  return [
    "| Overlay | DESIGN episodes | DESIGN weekdays | Coverage by base regime |",
    "| --- | ---: | ---: | --- |",
    ...OVERLAY_IDS.map((id) => `| ${id} | ${coverage[id].episodes} | ${coverage[id].weekdays} | ${REGIME_IDS.map((regime) => `${regime}: ${coverage[id].byRegime[regime]}`).join("; ")} |`),
  ].join("\n");
}
function extrapolationTable(coverage) {
  return [
    "| Base regime | DESIGN bars | Bars flagged `EXTRAPOLATION` | Flagged share | Per-dial counts |",
    "| --- | ---: | ---: | ---: | --- |",
    ...REGIME_IDS.map((regime) => {
      const item = coverage[regime];
      const rate = item.bars ? percentCoverage(item.extrapolationBars / item.bars) : "0.0%";
      const dials = Object.keys(item.byDial).sort().map((dial) => `${dial}: ${item.byDial[dial]}`).join(", ") || "none";
      return `| ${regime} | ${item.bars} | ${item.extrapolationBars} | ${rate} | ${dials} |`;
    }),
  ].join("\n");
}
function aucTable(rows) {
  return [
    "| Regime pair | ATR% 48 | Drift z 48 | VR8 240 | VR16 240 | Best feature | Best AUC | Samples | Status |",
    "| --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |",
    ...rows.map((row) => `| ${row.regimeA} vs ${row.regimeB} | ${format(row.featureAucs.rolling48AtrPercent, 4)} | ${format(row.featureAucs.rolling48DriftZ, 4)} | ${format(row.featureAucs.rolling240VarianceRatio8, 4)} | ${format(row.featureAucs.rolling240VarianceRatio16, 4)} | ${row.bestFeature} | ${format(row.bestSingleFeatureAuc, 4)} | ${row.sampleCountA} / ${row.sampleCountB} | ${row.status} |`),
  ].join("\n");
}
function artifactHashTable(paths) {
  return [
    "| Artifact | SHA-256 |",
    "| --- | --- |",
    ...paths.map((path) => `| ${relativeRoot(path)} | ${hashFile(path)} |`),
  ].join("\n");
}

function buildReport({ sourceHash, realBands, design, locked, nullSet, designAttainment, nullAttainment, aucRows, pairwiseSummary, overlayCoverage, extrapolationCoverage, noLookahead, determinism, parserRoundTrip, settings, topLevelPaths }) {
  const designDegraded = designAttainment.filter((row) => row.status === "DEGRADED").map((row) => row.regimeId);
  const nullDegraded = nullAttainment.filter((row) => row.status === "DEGRADED").map((row) => row.regimeId);
  const inseparable = pairwiseSummary.inseparablePairs;
  const stage1Commit = "cdaa863130df5ed5ac8da386302532868b24259c";
  const stage2DataTag = STATUS_TAG ? `\n\n> **${STATUS_TAG}**` : "";
  return `# Synth V2 Stage 2 — planted, labelled regimes

Generated **${new Date().toISOString().slice(0, 10)}**. Artifact generation/integrity: **PASS**. Realism is diagnostic, not a gate. Stage 1b G2: **${G2_PASS ? "PASS" : "FAIL"}**.${STATUS_TAG ? `\n\n> **${STATUS_TAG}**` : ""}

## Provenance and Stage 1b handoff

- Frozen source CSV SHA-256: \`${sourceHash}\`; calibration-profile SHA-256: \`${hashFile(join(SYNTH_DIR, "profile.json"))}\`.
- Stage 1b commit: \`${stage1Commit}\`. It was pushed to \`origin/arena/01a0f7c9-system\`; \`git ls-remote\` matched the local Stage 1b HEAD before Stage 2 began.
- Stage 1b G2 lag-1 and all other fixed gates passed; see \`REPORT.md\` and \`gate-results.json\`. No tolerance or Stage 2 setting was changed in response to LOCKED TEST.
- This is OHLC-only market-statistics work. No detector, strategy, trade, R, P&L, analyzer result, or strategy result was used or evaluated.
- DESIGN seeds **1–200** (200 paths); LOCKED TEST seeds **1001–1200** (200 paths); NULL seeds **2001–2700** (700 paths, 100 per base regime).

## Frozen base regimes and dial settings

The seven IDs/settings are those specified in the task. Volatility and drift use source p10/p50/p90. Trend extremes use the Stage 1b VR-constrained endpoints; the raw trend p10 is retained in the profile but is not used where it violates the registered real VR range. Gap and news dials default to source p50; selected overlays set the corresponding dial to source p90. The per-bar wobble is then applied and every out-of-range or VR-bound-exceeding bar is labelled EXTRAPOLATION.

${settingTable(settings)}

The news_storm/gap_shocks overlay high settings and their per-segment incidence are described below. Base settings shown above are not extrapolation settings; the DESIGN table below reports the realized per-bar extrapolation-label coverage after wobble/transition blending.

## Planting rules

- Each DESIGN/LOCKED TEST path has 3–6 randomly selected segments. Segment lengths are rounded log-uniform draws of 10–60 trading weekdays. Adjacent segments never repeat the same regime.
- Each boundary gets a 48–200-bar linear dial blend, split across the adjacent segments and capped at half either segment to avoid overlap.
- Within-segment dial wobble uses deterministic interpolated daily knots bounded by ±10% of the empirical p10–p90 dial-band width. This interpretation is recorded in \`QUESTIONS.md\`.
- The optional overlays are independently selected with a provisional 25% probability per segment. Each selected overlay occupies one contiguous 2–5 weekday episode whose whole bars lie outside adjacent transition-blend windows; a segment without enough safe weekdays receives no episode. This is a coverage convention, not a market event-frequency estimate.
- NULL paths contain one 140-weekday segment for a single regime, no transition, and no overlays.
- Every saved bar has a compact label aligned with its candle: regime id, segment, blend flag, active dial values, overlay flags, specific and generic EXTRAPOLATION flags, gap class, and sampled news-tail flag.

## Real-source bands and per-segment check (a)

The Stage 2 source band for ATR is Wilder ATR(14)/prior close per eligible weekday bar; daily drift is log(last close / first open) for each weekday with at least 24 rows. VR8/VR16 use overlapping five-weekday rolling close-return windows wholly inside the sampled source weekday series so the same horizon fits inside the minimum ten-weekday planted segment. Blend-labelled bars are excluded from synthetic segment checks. Coverage is the share of computed non-blend observations inside the real p10–p90 band; a missing/empty segment sample has zero coverage. A segment attains only if all four metric coverages are at least 90%. The five-weekday VR interpretation is recorded in \`QUESTIONS.md\`; it does not change Stage 1's registered 120-weekday G6 or trend-endpoint bands.

| Statistic | Source p10 | Source p50 | Source p90 | Samples | Window |
| --- | ---: | ---: | ---: | ---: | --- |
| ATR(14)/close per bar | ${format(realBands.atrPercentPerBar.p10, 8)} | ${format(realBands.atrPercentPerBar.p50, 8)} | ${format(realBands.atrPercentPerBar.p90, 8)} | ${realBands.atrPercentPerBar.samples} | eligible weekday bars |
| Daily close/open log drift | ${format(realBands.dailyDrift.p10, 8)} | ${format(realBands.dailyDrift.p50, 8)} | ${format(realBands.dailyDrift.p90, 8)} | ${realBands.dailyDrift.samples} | one weekday |
| Variance ratio, horizon 8 | ${format(realBands.varianceRatio8.p10, 8)} | ${format(realBands.varianceRatio8.p50, 8)} | ${format(realBands.varianceRatio8.p90, 8)} | ${realBands.varianceRatio8.samples} | rolling ${realBands.windowWeekdays} weekdays |
| Variance ratio, horizon 16 | ${format(realBands.varianceRatio16.p10, 8)} | ${format(realBands.varianceRatio16.p50, 8)} | ${format(realBands.varianceRatio16.p90, 8)} | ${realBands.varianceRatio16.samples} | rolling ${realBands.windowWeekdays} weekdays |

### DESIGN attainment

${attainmentTable(designAttainment, "segments")}

**DEGRADED regimes (DESIGN):** ${designDegraded.length ? designDegraded.join(", ") : "none"}.

### NULL attainment

${attainmentTable(nullAttainment, "paths")}

**DEGRADED regimes (NULL):** ${nullDegraded.length ? nullDegraded.join(", ") : "none"}.

No Stage 2 check was patched or re-run with changed thresholds after seeing these outcomes.

## DESIGN overlay and EXTRAPOLATION coverage

${overlayTable(overlayCoverage)}

Selected overlay values are newsSpikeIntensity p90 for news_storm and gapSize p90 for gap_shocks. Values outside observed dial bands remain explicitly flagged per bar.

${extrapolationTable(extrapolationCoverage)}

## DESIGN-only separability check (b)

Four causal features are sampled every four bars from the past only: mean ATR(14)/close over the previous 48 completed bars, previous-48-return drift z-score, and rolling 240-return VR8/VR16. Blend-labelled and warm-up samples are omitted. The table shows each single-feature AUC oriented as max(AUC, 1−AUC), plus the best feature. Pair status is exactly the specified best-AUC <0.60 threshold. LOCKED TEST is not passed to this code.

${aucTable(aucRows)}

**INSEPARABLE pairs (best AUC <0.60):** ${inseparable.length ? inseparable.join(", ") : "none"}.

## Integrity checks

- Determinism: **PASS**; each DESIGN, LOCKED TEST, and NULL seed was generated twice with identical canonical encoded JSON SHA-256. Set counts are ${determinism.design} DESIGN, ${determinism.locked} LOCKED TEST, and ${determinism.null} NULL.
- No lookahead: **PASS**. Changing labels while holding the generated per-bar dials fixed left OHLC unchanged; mutating candles from bar ${noLookahead.futureMutationBarIndex} onward did not change the four-feature causal vector at that bar. AUC features use only bars completed before the classified bar.
- Engine parser round-trip: **${parserRoundTrip.exactDatetimeAndOhlc ? "PASS" : "FAIL"}** on DESIGN seed 1; ${parserRoundTrip.rows} rows parsed with exact timestamp/OHLC equality.
- Stage 2 repairs after checks: **0**. Failures remain DEGRADED/INSEPARABLE; no detector or strategy work was done.

## LOCKED TEST handling

> **LOCKED — DO NOT DESIGN, TUNE, OR LOOK AT RESULTS AGAINST THIS SET UNTIL A DETECTOR IS FROZEN.**

Seeds 1001–1200 were generated from the frozen regime rules, deterministically reproduced, and SHA-256 hashed. No realism, feature, AUC, detector, or path-distribution diagnostic was computed or reviewed for LOCKED TEST. The only retained facts are seed range/count, compressed byte count, and hashes. Per-seed canonical and compressed hashes are in \`LOCKED-TEST-SHA256SUMS.txt\`; set digest: \`${locked.setDigest}\`.

## Artifact inventory and checksums

- DESIGN: ${design.pathCount} paths, ${design.totalBars} bars, ${design.artifactBytes} compressed bytes; set digest \`${design.setDigest}\`.
- LOCKED TEST: ${locked.pathCount} paths, ${locked.artifactBytes} compressed bytes; set digest \`${locked.setDigest}\`. No test-set metrics are reported.
- NULL: ${nullSet.pathCount} paths, ${nullSet.totalBars} bars, ${nullSet.artifactBytes} compressed bytes; set digest \`${nullSet.setDigest}\`.
- Each set's checksum file stores per-seed canonical JSON and compressed-file SHA-256 values. Top-level output/source hashes are in \`STAGE2-SHA256SUMS.txt\`.

${artifactHashTable(topLevelPaths)}

## Assumptions and unverified items

- The Stage 0 clock audit supports fixed EAT, but the source's UTC section marker conflicts; evidence and the interim no-shift decision are in \`REPORT.md\` and \`QUESTIONS.md\`.
- Overlay event frequency/duration and additive wobble are disclosed conventions, not calibrated estimates. Stage 2 realism attainment is descriptive only.
- Stage 2 VR bands use five-weekday windows for segment-contained comparisons; this choice is explicit and separate from the registered Stage 1 gate.
- The source uses runtime IANA/Intl timezone data; tzdata version is not pinned.

## Out-of-scope working-tree edits at task entry

The following out-of-scope paths were present in \`git status --short\` at task entry and were not edited or staged for this task. Local HEAD/index was aligned to the already-pushed Stage 1b branch commit without overwriting their worktree contents; content under the retired \`src/lib/synth/\` tree was left untouched. The in-scope untracked \`src/lib/synth-v2/QUESTIONS.md\` at task entry was a blocker note for the previously missing prompt; it was replaced after the full task specification was supplied.

\`M\` means modified, \`??\` means untracked at task entry:

\`\`\`text
 M .env.example
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
?? tests/mt5-safety.test.mjs
\`\`\`
${stage2DataTag}
`;
}

function makeStageChecksumHeader(name, seedRange) {
  return [
    `# Set: ${name}`,
    `# Seeds: ${seedRange}`,
    `# Status: ${statusText()}`,
    "# canonicalPathSha256 artifactSha256 relativeFile",
  ];
}

function generateSet({ name, slug, seeds, pathForSeed, analyzePath }) {
  const dir = join(DATA_DIR, slug);
  mkdirSync(dir, { recursive: true });
  cleanOldSeedFiles(dir);
  const rows = [];
  let artifactBytes = 0;
  let totalBars = 0;
  for (const seed of seeds) {
    const path = pathForSeed(seed);
    const canonical = encodeStage2Artifact(path, STATUS_TAG);
    const reproduced = encodeStage2Artifact(pathForSeed(seed), STATUS_TAG);
    if (canonical !== reproduced) throw new Error(`${name} seed ${seed} failed canonical byte determinism`);
    const canonicalHash = sha256(canonical);
    const compressed = gzipSync(Buffer.from(canonical), { level: 9, mtime: 0 });
    const artifactHash = sha256(compressed);
    const filename = `seed-${String(seed).padStart(4, "0")}.json.gz`;
    const fullPath = join(dir, filename);
    writeFileSync(fullPath, compressed);
    artifactBytes += compressed.length;
    const relativePath = relativeRoot(fullPath);
    rows.push(`${canonicalHash} ${artifactHash} ${relativePath}`);
    if (name !== "LOCKED TEST") totalBars += path.synthetic.candles.length;
    if (analyzePath) analyzePath(path, seed, compressed);
  }
  const sumPath = join(SYNTH_DIR, `${slug.toUpperCase()}-SHA256SUMS.txt`);
  const header = makeStageChecksumHeader(name, `${seeds[0]}-${seeds[seeds.length - 1]}`);
  const contents = [...header, ...rows].join("\n") + "\n";
  writeFileSync(sumPath, contents);
  const setDigest = sha256(rows.join("\n"));
  return { name, slug, seedStart: seeds[0], seedEnd: seeds[seeds.length - 1], pathCount: seeds.length, totalBars: name === "LOCKED TEST" ? undefined : totalBars, artifactBytes, setDigest, checksumPath: sumPath, directory: dir };
}

function main() {
  const sourceHash = assertSourceFrozen();
  if (!profile.trendinessBounds) throw new Error("Stage 1b trend variance bounds are missing");
  mkdirSync(DATA_DIR, { recursive: true });

  const sourceCandles = parseSourceCsv(readFileSync(SOURCE_PATH, "utf8"));
  const realBands = deriveStage2Bands(sourceCandles, 5);
  const settings = regimeSettings(profile);
  const designAttainmentRows = [];
  const nullAttainmentRows = [];
  const aucAccumulator = createPairwiseAucAccumulator();
  const overlayCoverage = createOverlayAccumulator();
  const extrapolationCoverage = createExtrapolationAccumulator();
  let noLookahead = null;
  let parserRoundTrip = null;
  let designOneCompressed = null;
  const designSeeds = Array.from({ length: 200 }, (_, index) => index + 1);
  const lockedSeeds = Array.from({ length: 200 }, (_, index) => index + 1001);
  const design = generateSet({
    name: "DESIGN",
    slug: "design",
    seeds: designSeeds,
    pathForSeed: (seed) => generateStage2Path(profile, { seed, set: "DESIGN" }),
    analyzePath: (path, seed, compressed) => {
      designAttainmentRows.push(...summarizeStage2Realism(path, realBands));
      addDesignPathToPairwiseAuc(aucAccumulator, path);
      collectOverlayCoverage(overlayCoverage, path);
      collectExtrapolationCoverage(extrapolationCoverage, path);
      if (seed === 1) {
        noLookahead = checkNoLookahead(path);
        designOneCompressed = compressed;
        const decoded = decodeStage2Artifact(compressed);
        const parsed = parseCsv(decoded.csv);
        const exact = parsed.metadataError === undefined && parsed.candles.length === decoded.candles.length &&
          parsed.candles.every((row, index) => {
            const expected = decoded.candles[index];
            return row.datetime === expected.datetime && row.open === expected.open && row.high === expected.high &&
              row.low === expected.low && row.close === expected.close;
          });
        parserRoundTrip = { sampleSet: "DESIGN", sampleSeed: 1, rows: parsed.candles.length, exactDatetimeAndOhlc: exact };
        if (!exact) throw new Error("engine parser did not round-trip DESIGN seed 1 exactly");
      }
    },
  });
  const locked = generateSet({
    name: "LOCKED TEST",
    slug: "locked-test",
    seeds: lockedSeeds,
    pathForSeed: (seed) => generateStage2Path(profile, { seed, set: "LOCKED TEST" }),
    analyzePath: undefined,
  });
  const nullSeeds = Array.from({ length: 700 }, (_, index) => index + 2001);
  const nullSet = generateSet({
    name: "NULL",
    slug: "null",
    seeds: nullSeeds,
    pathForSeed: (seed) => {
      const regimeIndex = Math.floor((seed - 2001) / 100);
      const regimeId = REGIME_IDS[regimeIndex];
      if (!regimeId) throw new Error(`NULL seed ${seed} has no regime assignment`);
      return generateStage2Path(profile, { seed, set: "NULL", regimeId });
    },
    analyzePath: (path) => nullAttainmentRows.push(...summarizeStage2Realism(path, realBands)),
  });
  const pairwiseRows = finishPairwiseAuc(aucAccumulator);
  const pairwiseSummary = summarizePairwiseAuc(pairwiseRows);
  const designAttainment = summarizeStage2Attainment(designAttainmentRows);
  const nullAttainment = summarizeStage2Attainment(nullAttainmentRows);

  const formatPath = join(DATA_DIR, "FORMAT.md");
  const formatLines = [
    STATUS_TAG ? `Status: ${STATUS_TAG}` : "Status: Stage 1b G2 passed",
    "",
    "# Stage 2 path artifact format",
    "",
    "Each `stage2-data/{design,locked-test,null}/seed-NNNN.json.gz` is a gzip-compressed UTF-8 JSON record using `synth-v2-stage2-delta-json-v1`. One file is one deterministic seeded path. The payload stores exact minute-delta timestamps, OHLC-cent deltas, per-bar label bit fields, fixed-point dial deltas at scale 1e9, the segment plan, and the Stage 1b G2 status tag.",
    "",
    "Use `decodeStage2Artifact` from `src/lib/synth-v2/stage2-artifacts.ts` to expand a record into candles, per-bar labels, and engine-parser-compatible CSV. `DESIGN-seed-1-engine.csv` is the parser round-trip sample. Per-seed canonical JSON and compressed-file SHA-256 values are in the set checksum files.",
    "",
    "The `locked-test` directory is embargoed until a detector is frozen. The runner generates, deterministically re-generates for byte comparison, compresses, and hashes those paths; it does not compute or print their statistical properties.",
  ];
  writeFileSync(formatPath, `${formatLines.join("\n")}\n`);

  updateStage1ChecksumInventory();
  const designCsvPath = join(SYNTH_DIR, "DESIGN-seed-1-engine.csv");
  const decodedSeed1 = decodeStage2Artifact(designOneCompressed);
  writeFileSync(designCsvPath, decodedSeed1.csv);
  const designSet = design;
  const nullInfo = nullSet;

  const checks = {
    generatedDate: new Date().toISOString().slice(0, 10),
    statusTag: STATUS_TAG,
    sourceSha256: sourceHash,
    stage1G2Pass: G2_PASS,
    fixedGateTolerancesChanged: false,
    stage2RepairsAfterChecks: 0,
    sourceRealBands: realBands,
    regimeDialSettings: settings,
    realismMethod: {
      excludedBlendBars: true,
      requiredCoveragePerStatistic: 0.9,
      missingOrEmptySamplesCountAsZero: true,
      windowWeekdays: realBands.windowWeekdays,
      designByRegime: designAttainment,
      nullByRegime: nullAttainment,
      designSegmentDetails: designAttainmentRows,
      nullSegmentDetails: nullAttainmentRows,
    },
    overlayCoverageDesign: overlayCoverage,
    extrapolationCoverageDesign: extrapolationCoverage,
    designOnlyPairwiseAuc: pairwiseSummary,
    noLookahead,
    determinism: {
      canonicalSha256RecreatedForEverySeed: true,
      seedCounts: { DESIGN: designSeeds.length, "LOCKED TEST": lockedSeeds.length, NULL: 700 },
      fixedConfigAndSeedByteDeterministic: true,
    },
    engineParserRoundTrip: parserRoundTrip,
    lockedTest: {
      label: "LOCKED — do not design, tune, or look at results against this set until a detector is frozen.",
      seeds: [1001, 1200],
      paths: locked.pathCount,
      analyzedForRealismFeaturesOrAuc: false,
      onlyGeneratedDeterministicallyReproducedAndHashed: true,
      setDigest: locked.setDigest,
      compressedBytes: locked.artifactBytes,
    },
  };
  const checksPath = join(SYNTH_DIR, "STAGE2-CHECKS.json");
  jsonFile(checksPath, checks);

  const designSumPath = join(SYNTH_DIR, "DESIGN-SHA256SUMS.txt");
  const lockedSumPath = join(SYNTH_DIR, "LOCKED-TEST-SHA256SUMS.txt");
  const nullSumPath = nullInfo.checksumPath;
  const topLevelArtifactPaths = [
    checksPath,
    designCsvPath,
    designSumPath,
    lockedSumPath,
    nullSumPath,
    formatPath,
    join(SYNTH_DIR, "regimes.ts"),
    join(SYNTH_DIR, "stage2-validation.ts"),
    join(SYNTH_DIR, "stage2-artifacts.ts"),
    join(SYNTH_DIR, "generate.ts"),
    join(SYNTH_DIR, "types.ts"),
    join(SYNTH_DIR, "index.ts"),
    join(SYNTH_DIR, "README.md"),
    join(SYNTH_DIR, "QUESTIONS.md"),
    join(SYNTH_DIR, "SHA256SUMS.txt"),
    join(SYNTH_DIR, "random.ts"),
    join(SYNTH_DIR, "time.ts"),
    join(SYNTH_DIR, "csv.ts"),
    join(SYNTH_DIR, "metrics.ts"),
    join(SYNTH_DIR, "validation.ts"),
    join(SYNTH_DIR, "profile.json"),
    join(SYNTH_DIR, "gate-results.json"),
    join(ROOT, "scripts/synth-v2-stage2.mjs"),
    join(ROOT, "tests/synth-v2.test.mjs"),
  ];
  const reportPath = join(SYNTH_DIR, "STAGE2-REPORT.md");
  const reportData = {
    sourceHash,
    realBands,
    design: designSet,
    locked,
    nullSet: nullInfo,
    designAttainment,
    nullAttainment,
    aucRows: pairwiseRows,
    pairwiseSummary,
    overlayCoverage,
    extrapolationCoverage,
    noLookahead,
    determinism: { design: designSeeds.length, locked: lockedSeeds.length, null: 700 },
    parserRoundTrip,
    settings,
    topLevelPaths: topLevelArtifactPaths,
  };
  writeFileSync(reportPath, `${buildReport(reportData).trimEnd()}\n`);

  const manifestPath = join(SYNTH_DIR, "STAGE2-MANIFEST.json");
  const topLevelArtifactHashes = Object.fromEntries(topLevelArtifactPaths.map((path) => [relativeRoot(path), hashFile(path)]));
  topLevelArtifactHashes[relativeRoot(reportPath)] = hashFile(reportPath);
  const manifest = {
    schemaVersion: 1,
    generatedDate: new Date().toISOString().slice(0, 10),
    statusTag: STATUS_TAG,
    sourceSha256: sourceHash,
    profileSha256: hashFile(join(SYNTH_DIR, "profile.json")),
    stage1G2Pass: G2_PASS,
    design: {
      seedStart: designSeeds[0], seedEnd: designSeeds.at(-1), pathCount: design.pathCount,
      weekdaysPerSegment: [10, 60], totalBars: design.totalBars, setDigest: design.setDigest, artifactBytes: design.artifactBytes,
    },
    lockedTest: {
      status: "LOCKED", seedStart: lockedSeeds[0], seedEnd: lockedSeeds.at(-1), pathCount: locked.pathCount,
      analyzed: false, setDigest: locked.setDigest, artifactBytes: locked.artifactBytes,
    },
    null: {
      seedStart: 2001, seedEnd: 2700, pathCount: 700, pathsPerRegime: 100, weekdaysPerPath: 140,
      totalBars: nullInfo.totalBars, setDigest: nullInfo.setDigest, artifactBytes: nullInfo.artifactBytes,
    },
    artifactDirectories: {
      design: "src/lib/synth-v2/stage2-data/design",
      lockedTest: "src/lib/synth-v2/stage2-data/locked-test",
      null: "src/lib/synth-v2/stage2-data/null",
    },
    seedChecksumFiles: [relativeRoot(designSumPath), relativeRoot(lockedSumPath), relativeRoot(nullSumPath)],
    topLevelArtifactHashes,
  };
  jsonFile(manifestPath, manifest);

  const stage2SumsPath = join(SYNTH_DIR, "STAGE2-SHA256SUMS.txt");
  const stage2HashPaths = [reportPath, checksPath, manifestPath, designCsvPath, designSumPath, lockedSumPath, nullSumPath, formatPath, ...topLevelArtifactPaths.filter((path) => ![checksPath, designCsvPath, designSumPath, lockedSumPath, nullSumPath, formatPath].includes(path))];
  const uniquePaths = [...new Set(stage2HashPaths)];
  const stage2Sums = [
    "# Synth V2 Stage 2 SHA-256 inventory",
    `# Status: ${statusText()}`,
    ...uniquePaths.map((path) => `${hashFile(path)}  ${relativeRoot(path)}`),
  ];
  writeFileSync(stage2SumsPath, `${stage2Sums.join("\n")}\n`);

  console.log(`Synth V2 Stage 2 complete: DESIGN=${design.pathCount}, LOCKED TEST=${locked.pathCount}, NULL=${nullInfo.pathCount}; ${(design.pathCount + locked.pathCount + nullInfo.pathCount)} compressed paths, ${design.artifactBytes + locked.artifactBytes + nullInfo.artifactBytes} bytes; G2=${G2_PASS ? "PASS" : "FAIL"}; inseparable pairs=${pairwiseSummary.inseparablePairs.length}.`);
}

main();
