import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";
import { generateStage2BPath, getStage2BSettings } from "../src/lib/synth-v2/stage2b-regimes.ts";
import {
  addStage2BDesignPathToAuc,
  computeStage2BCausalFeatures,
  computeStage2BPathWindows,
  createStage2BAucAccumulator,
  evaluateStage2BCohort,
  finishStage2BAuc,
  hardPairRows,
} from "../src/lib/synth-v2/stage2b-validation.ts";
import { decodeStage2Artifact, encodeStage2Artifact } from "../src/lib/synth-v2/stage2-artifacts.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SYNTH_DIR = resolve(ROOT, "src/lib/synth-v2");
const SPEC_2B_PATH = resolve(SYNTH_DIR, "SPEC-2b.md");
const SPEC_2C_PATH = resolve(SYNTH_DIR, "SPEC-2c.md");
const SPEC_2C_SHA_PATH = resolve(SYNTH_DIR, "SPEC-2c.sha256");
const CONFIG_PATH = resolve(SYNTH_DIR, "STAGE2C-CONFIG.json");
const PRE_REGISTRATION_PATH = resolve(SYNTH_DIR, "STAGE2C-PRE-REGISTRATION.json");
const REAL_BANDS_PATH = resolve(SYNTH_DIR, "STAGE2C-REAL-BANDS.json");
const SEEDS_PATH = resolve(SYNTH_DIR, "STAGE2C-SEEDS.json");
const INVENTORY_PATH = resolve(SYNTH_DIR, "STAGE2C-SHA256SUMS.txt");
const REPORT_PATH = resolve(SYNTH_DIR, "STAGE2C-REPORT.md");
const DATA_ROOT = resolve(SYNTH_DIR, "stage2c-data");
const VOL_MAP_PATH = resolve(SYNTH_DIR, "STAGE2C-VOL-MAP.json");

const METRICS = ["atrPercent", "drift", "varianceRatio8", "varianceRatio16"];
const METRIC_LABELS = {
  atrPercent: "ATR%",
  drift: "Drift",
  varianceRatio8: "VR8",
  varianceRatio16: "VR16",
};
const AUC_LABELS = {
  rolling48AtrPercent: "ATR% 48 bars",
  rolling48DriftZ: "Drift z 48 returns",
  rolling48VarianceRatio8: "VR8 48 returns",
  rolling48VarianceRatio16: "VR16 48 returns",
};

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function hashFile(path) { return sha256(readFileSync(path)); }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function clean(value) { return String(value).replaceAll("|", "\\|").replaceAll("\n", " "); }
function fmt(value, digits = 6) { return value === null || value === undefined || !Number.isFinite(value) ? "—" : Number(value).toFixed(digits); }
function pct(value, digits = 1) { return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`; }
function metricValue(metric, value, digits = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (metric === "atrPercent" || metric === "drift") return `${(value * 100).toFixed(digits)}%`;
  return value.toFixed(digits);
}
function metricError(metric, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}
function keyFor(set, seed, regimeId = "") { return `${set}|${regimeId}|${seed}`; }
function artifactRelativePath(set, seed, regimeId = "") {
  if (set === "DESIGN") return `design/seed-${seed}.json.gz`;
  if (set === "LOCKED TEST") return `locked-test/seed-${seed}.json.gz`;
  if (set === "NULL") return `null/${regimeId}/seed-${seed}.json.gz`;
  throw new Error(`unknown Stage 2c set ${set}`);
}
function makePathOptions(set, seed, regimeId) {
  return { set, seed, ...(regimeId ? { regimeId } : {}) };
}

function encodeGeneratedPath(profile, calibration, options) {
  const path = generateStage2BPath(profile, calibration, options);
  const canonical = encodeStage2Artifact(path);
  const compressed = gzipSync(Buffer.from(canonical, "utf8"), { level: 9, mtime: 0 });
  return {
    path,
    canonical,
    compressed,
    canonicalSha256: sha256(canonical),
    compressedSha256: sha256(compressed),
  };
}

function mustBeIgnored(relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], { cwd: ROOT, stdio: "ignore" });
  } catch {
    throw new Error(`generated path is not ignored by git: ${relativePath}`);
  }
}

function verifySeedList(seeds) {
  const range = (start, count) => Array.from({ length: count }, (_, index) => start + index);
  if (JSON.stringify(seeds.design) !== JSON.stringify(range(8001, 200))) throw new Error("DESIGN seed list differs from the frozen range 8001-8200");
  if (JSON.stringify(seeds.lockedTest) !== JSON.stringify(range(6001, 200))) throw new Error("LOCKED TEST seed list differs from the frozen range 6001-6200");
  const regimeIds = STAGE2B_REGIMES.map(({ id }) => id);
  if (JSON.stringify(Object.keys(seeds.nullSeedsByRegime)) !== JSON.stringify(regimeIds)) throw new Error("NULL regime seed order differs from the frozen regime order");
  let start = 20001;
  for (const regimeId of regimeIds) {
    if (JSON.stringify(seeds.nullSeedsByRegime[regimeId]) !== JSON.stringify(range(start, 100))) {
      throw new Error(`NULL seed range differs for ${regimeId}`);
    }
    start += 100;
  }
  const auditPaths = seeds.rebuildVerification?.paths;
  if (!Array.isArray(auditPaths) || auditPaths.length !== 20) throw new Error("exactly 20 rebuild-verification paths must be frozen");
  const allowed = new Set([
    ...seeds.design.map((seed) => keyFor("DESIGN", seed)),
    ...regimeIds.flatMap((regimeId) => seeds.nullSeedsByRegime[regimeId].map((seed) => keyFor("NULL", seed, regimeId))),
  ]);
  for (const item of auditPaths) {
    if (!allowed.has(keyFor(item.set, item.seed, item.regimeId ?? ""))) throw new Error(`invalid rebuild-verification path: ${JSON.stringify(item)}`);
  }
  if (new Set(auditPaths.map((item) => keyFor(item.set, item.seed, item.regimeId ?? ""))).size !== 20) throw new Error("rebuild-verification paths must be unique");
}

function verifyPreRegistration() {
  if (!existsSync(SPEC_2B_PATH)) {
    throw new Error("src/lib/synth-v2/SPEC-2b.md is missing; STOP and report");
  }
  const pre = readJson(PRE_REGISTRATION_PATH);
  const config = readJson(CONFIG_PATH);
  const calibration = readJson(REAL_BANDS_PATH);
  const seeds = readJson(SEEDS_PATH);
  const profile = readJson(resolve(SYNTH_DIR, "profile.json"));

  if (!pre.recordedBeforeSyntheticGeneration) throw new Error("preregistration must be recorded before synthetic generation");
  if (pre.generatedSyntheticPaths !== 0) throw new Error("preregistration path counter must be zero at entry");

  const expectedSource = config.sourceSha256;
  const currentSource = hashFile(resolve(ROOT, config.sourceFile));
  if (currentSource !== expectedSource) throw new Error(`source hash mismatch: ${currentSource} != ${expectedSource}`);

  const specSha = hashFile(SPEC_2C_PATH);
  if (specSha !== pre.specSha256 || specSha !== config.specSha256) throw new Error(`SPEC-2c hash mismatch: ${specSha}`);
  const specShaRecorded = readFileSync(SPEC_2C_SHA_PATH, "utf8").trim().split(/\s+/)[0];
  if (specShaRecorded !== specSha) throw new Error(`SPEC-2c.sha256 mismatch: ${specShaRecorded} != ${specSha}`);

  const seedsSha = hashFile(SEEDS_PATH);
  if (seedsSha !== pre.seedListSha256 || seedsSha !== config.seedListSha256) throw new Error(`STAGE2C-SEEDS hash mismatch: ${seedsSha}`);

  const bandsSha = hashFile(REAL_BANDS_PATH);
  if (bandsSha !== pre.realBandsSha256 || bandsSha !== config.realBandsSha256) throw new Error(`STAGE2C-REAL-BANDS hash mismatch: ${bandsSha}`);

  const configSha = hashFile(CONFIG_PATH);
  if (configSha !== pre.configSha256) throw new Error(`STAGE2C-CONFIG hash mismatch: ${configSha}`);

  verifySeedList(seeds);
  return { pre, config, calibration, profile, seeds };
}

function parserRoundTrip(encoded, original) {
  const decoded = decodeStage2Artifact(encoded.canonical);
  const parsed = parseCsv(decoded.csv);
  if (parsed.metadataError || parsed.missingMetadataField) throw new Error(`engine parser rejected roundtrip CSV: ${parsed.metadataError ?? parsed.missingMetadataField}`);
  if (parsed.candles.length !== original.synthetic.candles.length) throw new Error(`candle count mismatch: ${parsed.candles.length} != ${original.synthetic.candles.length}`);
  for (let index = 0; index < parsed.candles.length; index++) {
    const fromParser = parsed.candles[index];
    const fromOriginal = original.synthetic.candles[index];
    if (fromParser.datetime !== fromOriginal.datetime || fromParser.open !== fromOriginal.open || fromParser.high !== fromOriginal.high || fromParser.low !== fromOriginal.low || fromParser.close !== fromOriginal.close) {
      throw new Error(`roundtrip candle mismatch at index ${index} (${fromOriginal.datetime})`);
    }
  }
  return { rows: parsed.candles.length, csvSha256: sha256(decoded.csv) };
}

function mergeRows(values) { return values.map((row) => `| ${row.map(clean).join(" | ")} |`).join("\n"); }

function formatSettingsTable(calibration) {
  const settings = STAGE2B_REGIMES.map(({ id }) => getStage2BSettings(calibration, id));
  const rows = settings.map((setting) => {
    const levels = setting.levels;
    return [
      setting.regimeId,
      `${levels.volatility} (target ${metricValue("atrPercent", setting.planted.atrPercent, 4)}; dial ${fmt(setting.dials.volatilityLevel, 6)})`,
      `${levels.drift} (${metricValue("drift", setting.dials.drift, 4)})`,
      `${levels.trend} (phi ${fmt(setting.dials.trendiness, 6)}; targets ${fmt(setting.planted.varianceRatio8, 4)}/${fmt(setting.planted.varianceRatio16, 4)})`,
      `${fmt(setting.dials.gapSize, 6)} / ${fmt(setting.overlayHighs.gapSize, 6)}`,
      `${fmt(setting.dials.newsSpikeIntensity, 6)} / ${fmt(setting.overlayHighs.newsSpikeIntensity, 6)}`,
      `vol ±${fmt(setting.wobbleWidths.volatilityLevel * 0.1, 8)}; drift ±${fmt(setting.wobbleWidths.drift * 0.1, 8)}; phi ±${fmt(setting.wobbleWidths.trendiness * 0.1, 8)}; gap ±${fmt(setting.wobbleWidths.gapSize * 0.1, 8)}; news ±${fmt(setting.wobbleWidths.newsSpikeIntensity * 0.1, 8)}`,
    ];
  });
  return `| Regime | Volatility level (target ATR%; dial) | Drift (p17/p50/p83) | Trend control (phi; target VR8/VR16) | Gap p50 / overlay p90 | News p50 / overlay p90 | Additive wobble amplitudes (vol / drift / phi / gap / news) |
| --- | --- | --- | --- | ---: | ---: | --- |
${mergeRows(rows)}`;
}

function formatBands(calibration) {
  const rows = ["atrPercent", "drift", "varianceRatio8", "varianceRatio16", "gapSize", "newsSpikeIntensity"].map((metric) => {
    const band = calibration.distributions[metric];
    const value = (probability) => {
      const raw = band[probability];
      return metric === "atrPercent" || metric === "drift" ? `${(raw * 100).toFixed(6)}%` : fmt(raw);
    };
    return [METRIC_LABELS[metric] ?? metric, band.samples, value("p5"), value("p17"), value("p33"), value("p50"), value("p67"), value("p83"), value("p90"), value("p95")];
  });
  return `| Statistic | W=20 samples | p5 | p17 | p33 | p50 | p67 | p83 | p90 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${mergeRows(rows)}`;
}

function formatCeilings(calibration) {
  const rows = [];
  for (const metric of METRICS) {
    for (const level of ["LOW", "NORMAL", "HIGH"]) {
      const ceiling = calibration.realCeilings[metric][level];
      rows.push([METRIC_LABELS[metric], level, ceiling.n, pct(ceiling.ceiling), ceiling.thin ? "THIN" : "OK"]);
    }
  }
  return `| Statistic | Tercile | 60-weekday stretches (n) | Real ceiling | Flag |
| --- | --- | ---: | ---: | --- |
${mergeRows(rows)}`;
}

function formatCohortChecks(name, checks) {
  const rows = [];
  for (const regime of checks.regimes) {
    for (const metric of METRICS) {
      const item = regime.metricChecks[metric];
      rows.push([
        regime.regimeId,
        METRIC_LABELS[metric],
        item.intendedLevel,
        metricValue(metric, item.plantedSetting, 5),
        metricValue(metric, item.realizedMedian, 5),
        pct(item.realizedTercileShare),
        pct(item.realTercileCeiling),
        item.c1Difference === null ? "—" : `${item.c1Difference >= 0 ? "+" : ""}${(item.c1Difference * 100).toFixed(1)} pp`,
        metricError(metric, item.c2NormalizedError),
        item.c1Status,
        item.c2Status,
        item.c3Status,
        item.windowCount,
        regime.status,
      ]);
    }
  }
  const orderingRows = METRICS.map((metric) => {
    const item = checks.ordering[metric];
    return [METRIC_LABELS[metric], metricValue(metric, item.lowMedian), metricValue(metric, item.normalMedian), metricValue(metric, item.highMedian), item.pass ? "PASS" : "FAIL"];
  });
  return `### ${name} regime/statistic checks

| Regime | Statistic | Intended | Planted setting | Realized median | Synthetic intended-tercile share | Real ceiling | C1 difference | C2 normalized median error | C1 | C2 | C3 | W=20 windows | Regime status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
${mergeRows(rows)}

**${name} pooled C3 ordering**

| Statistic | LOW pooled median | NORMAL pooled median | HIGH pooled median | Ordering |
| --- | ---: | ---: | ---: | --- |
${mergeRows(orderingRows)}`;
}

function formatRegimePassSummary(name, checks) {
  const rows = checks.regimes.map((regime) => {
    const chk = regime.metricChecks;
    const atrPass = chk.atrPercent.c1Status === "PASS" && chk.atrPercent.c2Status === "PASS" && chk.atrPercent.c3Status === "PASS";
    const driftPass = chk.drift.c1Status === "PASS" && chk.drift.c2Status === "PASS" && chk.drift.c3Status === "PASS";
    const vr8Pass = chk.varianceRatio8.c1Status === "PASS" && chk.varianceRatio8.c2Status === "PASS" && chk.varianceRatio8.c3Status === "PASS";
    const vr16Pass = chk.varianceRatio16.c1Status === "PASS" && chk.varianceRatio16.c2Status === "PASS" && chk.varianceRatio16.c3Status === "PASS";
    const volFreePass = driftPass && vr8Pass && vr16Pass;
    return [
      regime.regimeId,
      `${atrPass ? "PASS" : "FAIL"} (${chk.atrPercent.c1Status}/${chk.atrPercent.c2Status})`,
      `${driftPass ? "PASS" : "FAIL"} (${chk.drift.c1Status}/${chk.drift.c2Status})`,
      `${vr8Pass ? "PASS" : "FAIL"} (${chk.varianceRatio8.c1Status}/${chk.varianceRatio8.c2Status})`,
      `${vr16Pass ? "PASS" : "FAIL"} (${chk.varianceRatio16.c1Status}/${chk.varianceRatio16.c2Status})`,
      regime.status,
      volFreePass ? "PASS" : "FAIL",
    ];
  });
  return `### ${name} per-regime pass table and vol-free pass column

| Regime | ATR% C1-C3 | Drift C1-C3 | VR8 C1-C3 | VR16 C1-C3 | Full Regime Status | Vol-Free Pass (Drift+VRs only) |
| --- | --- | --- | --- | --- | --- | --- |
${mergeRows(rows)}`;
}

function formatAuc(rows) {
  const table = rows.map((row) => [
    `${row.regimeA} vs ${row.regimeB}`,
    fmt(row.featureAucs.rolling48AtrPercent, 4),
    fmt(row.featureAucs.rolling48DriftZ, 4),
    fmt(row.featureAucs.rolling48VarianceRatio8, 4),
    fmt(row.featureAucs.rolling48VarianceRatio16, 4),
    AUC_LABELS[row.bestFeature] ?? row.bestFeature,
    fmt(row.bestSingleFeatureAuc, 4),
    `${row.sampleCountA} / ${row.sampleCountB}`,
    row.status,
  ]);
  const hard = hardPairRows(rows).map((row) => [
    `${row.regimeA} vs ${row.regimeB}`,
    AUC_LABELS[row.bestFeature] ?? row.bestFeature,
    fmt(row.bestSingleFeatureAuc, 4),
    row.status,
  ]);
  return `| Regime pair | ATR% 48 bars | Drift z 48 returns | VR8 48 returns | VR16 48 returns | Best single feature | Best oriented AUC | Samples A / B | Status |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
${mergeRows(table)}

**Requested hard pairs**

| Pair | Best feature | Best oriented AUC | Status |
| --- | --- | ---: | --- |
${mergeRows(hard)}

**INSEPARABLE pairs (best single-feature oriented AUC <0.60):** ${rows.filter((row) => row.status === "INSEPARABLE").map((row) => `${row.regimeA} vs ${row.regimeB}`).join(", ") || "none"}.`;
}

function formatExtrapolation(name, coverage) {
  const rows = STAGE2B_REGIMES.map(({ id }) => {
    const item = coverage[id] ?? { bars: 0, flaggedBars: 0, share: 0 };
    return [id, item.bars, item.flaggedBars, pct(item.share)];
  });
  return `### ${name} EXTRAPOLATION coverage

| Regime | Bars | Bars flagged | Flagged share |
| --- | ---: | ---: | ---: |
${mergeRows(rows)}`;
}

function formatOverlayCoverage(overlays) {
  const rows = ["news_storm", "gap_shocks"].map((overlayId) => {
    const item = overlays[overlayId] ?? { episodes: 0, weekdays: 0, byRegime: {} };
    const breakdown = STAGE2B_REGIMES.map(({ id }) => `${id}: ${item.byRegime[id] ?? 0}`).join("; ");
    return [overlayId, item.episodes, item.weekdays, breakdown];
  });
  return `| Overlay | DESIGN episodes | Overlay weekdays | Weekday coverage by base regime |
| --- | ---: | ---: | --- |
${mergeRows(rows)}`;
}

function aggregateCoverage(target, paths) {
  for (const path of paths) {
    for (const label of path.synthetic.labels) {
      const regimeId = label.regimeId;
      if (!regimeId) continue;
      const current = target[regimeId] ?? { bars: 0, flaggedBars: 0, share: 0 };
      current.bars++;
      if (label.flags.length) current.flaggedBars++;
      current.share = current.bars ? current.flaggedBars / current.bars : 0;
      target[regimeId] = current;
    }
  }
}

function collectOverlays(target, path) {
  const dayStarts = [];
  let offset = 0;
  for (const count of path.schedule.barCounts) {
    dayStarts.push(offset);
    offset += count;
  }
  for (const segment of path.segments) {
    for (const episode of segment.overlays) {
      const current = target[episode.overlayId] ?? { episodes: 0, weekdays: 0, byRegime: {} };
      current.episodes++;
      const duration = episode.endDayExclusive - episode.startDay;
      current.weekdays += duration;
      current.byRegime[segment.regimeId] = (current.byRegime[segment.regimeId] ?? 0) + duration;
      target[episode.overlayId] = current;
    }
  }
}

function verifyOverlayPlacement(path) {
  for (const segment of path.segments) {
    for (const episode of segment.overlays) {
      for (let day = episode.startDay; day < episode.endDayExclusive; day++) {
        const slots = path.schedule.templates[day].slots;
        let dayStartBar = 0;
        for (let prior = 0; prior < day; prior++) dayStartBar += path.schedule.barCounts[prior];
        for (let slot = 0; slot < slots.length; slot++) {
          const barIndex = dayStartBar + slot;
          if (path.synthetic.labels[barIndex].inBlend) {
            throw new Error(`overlay bar in blend zone at day ${day}, bar ${barIndex}`);
          }
        }
      }
    }
  }
}

function recordArtifact(inventoryStream, artifactRows, setTotals, set, seed, regimeId, fullPath, encoded, candleCount) {
  const row = {
    canonicalSha256: encoded.canonicalSha256,
    compressedSha256: encoded.compressedSha256,
    bytes: encoded.compressed.byteLength,
    path: relative(ROOT, fullPath).split(sep).join("/"),
    candles: candleCount,
    set,
    seed,
    regimeId,
  };
  artifactRows.push(row);
  const current = setTotals[set] ?? { paths: 0, bars: 0, bytes: 0 };
  current.paths++;
  current.bytes += row.bytes;
  if (candleCount) current.bars += candleCount;
  setTotals[set] = current;

  // Flush to disk immediately
  const line = `${row.canonicalSha256}  ${row.compressedSha256}  ${row.bytes}  ${row.path}\n`;
  appendFileSync(INVENTORY_PATH, line);
}

function makeReport(context) {
  const { pre, config, calibration, seeds, setTotals, designChecks, nullChecks, aucRows, designCoverage, nullCoverage, overlays, roundtrip, auditRows, g1g11Results } = context;
  const settings = formatSettingsTable(calibration);
  const bands = formatBands(calibration);
  const ceilings = formatCeilings(calibration);
  const codeLines = Object.entries(pre.codeHashes).map(([path, hash]) => `- \`${path}\`: \`${hash}\``).join("\n");
  const frozenLines = Object.entries(pre.frozenInputHashes).map(([path, hash]) => `- \`${path}\`: \`${hash}\``).join("\n");
  const audit = auditRows.map((row) => `| ${row.set}${row.regimeId ? `/${row.regimeId}` : ""} | ${row.seed} | ${row.canonicalMatch ? "PASS" : "FAIL"} | ${row.compressedMatch ? "PASS" : "FAIL"} |`).join("\n");
  const locked = setTotals["LOCKED TEST"];
  const design = setTotals.DESIGN;
  const nulls = setTotals.NULL;
  const auc = formatAuc(aucRows);
  const designPassSummary = formatRegimePassSummary("DESIGN", designChecks);
  const nullPassSummary = formatRegimePassSummary("NULL", nullChecks);

  const report = `# Synth V2 Stage 2c — preregistered W=20 regime study

Generated **2026-10-04**. Full Stage 2c validation and cohort generation report.

## Part A — Diagnosis of Stage 2b Gaps

- **A1. 757f91b Diagnosis Verification:**
  - Real gold $W=20$ ATR% bands: $p_{17}=0.15166\\%$, $p_{50}=0.18158\\%$, $p_{83}=0.25978\\%$. (Median 0.18158%, p10 0.14007%, p90 0.29313% sliding; non-overlapping median 0.17587%, p10 0.13707%, p90 0.30414%).
  - Stage 2b DESIGN realized ATR% medians were ~2.5x planted across all 7 regimes (quiet_range 0.37374% vs 0.15166%; normal_chop 0.46283% vs 0.18158%; whipsaw 0.61853% vs 0.25978%).
  - When the base model was evaluated at its default Stage 1b "normal" dial (0.00123003), realized median window ATR% was 0.28745% (non-overlapping) / 0.29205% (sliding) vs real gold 0.17587% / 0.18158%. Because the default setting does NOT reproduce real ATR%, **the base model has a level fault**, compound with a units mismatch in the Stage 2b dial mapping (which assigned realized ATR% quantiles to an innovation daily standard deviation dial).
  - Drift and VR8/VR16 passed C1-C3 in Stage 2b across almost all regimes (drift C2 passed in 7/7 regimes; VR8 passed C1-C3 in 7/7 regimes; VR16 passed C1-C3 in 6/7 regimes). They did not suffer a units mismatch.
- **A2. INSEPARABLE Pairs:**
  - Four pairs were INSEPARABLE in Stage 2b: \`quiet_range vs normal_chop\` (0.5869), \`normal_chop vs trend_up\` (0.5637), \`normal_chop vs trend_down\` (0.5630), \`expansion_up vs expansion_down\` (0.5785).
  - Only ONE pair (\`quiet_range vs normal_chop\`) differed in volatility. The other three pairs have identical planted volatility levels and differ solely in drift and trend.
- **A3. Generator Crash on Seed 6142:**
  - Error message: \`bar-shape construction produced invalid OHLC at 2026-08-24 15:00:00\`.
  - Schedule: 4 segments (normal_chop 30d, expansion_down 69d, trend_up 29d, whipsaw 39d), total 167 weekdays.
  - Crash bar: Day 87, slot 28 (15:00:00), barIndex 4042, inside segment 1 (expansion_down), overlays empty.
  - Dial values: vol 0.002549, drift -0.001352, trendiness 0.057827, gap 0.125048, news 0.024305.
  - Reproduced on debug seed 90135 at 2026-08-28 17:00:00.
  - Root cause: unconstrained lower wick subtraction \`min(open, close) - wickTotal * (1 - upperFraction)\` drove \`low\` negative (-163.94) on an extreme downward bar with small body share and large lower wick share.
- **A4. Stage 1 Gates Audit:**
  - Stage 1 gates measured return kurtosis / ATR (G1), raw return ACF (G2), candle shape shares (G3), gap stats / ATR (G4), intraday seasonality shares (G5), variance ratios over 120 days (G6), daily range / ATR (G7), invariants/determinism (G8), and single-dial moves (D1).
  - NONE of the Stage 1 gates tested the absolute level of ATR%, its dispersion across 20-weekday windows, or its persistence across weeks.

## Stage 2c Provenance and Frozen Inputs

- Source: \`XAUUSD_30min_2020-01-24_to_2026-10-01.csv\`; SHA-256 \`${pre.sourceSha256}\`.
- SPEC-2b incorporated unchanged: \`${hashFile(SPEC_2B_PATH)}\`.
- SPEC-2c SHA-256: \`${pre.specSha256}\`.
- Real W=20 calibration SHA-256: \`${pre.realBandsSha256}\`.
- Config SHA-256: \`${pre.configSha256}\`.
- Seed-list SHA-256: \`${pre.seedListSha256}\`.
- Profile SHA-256: \`${pre.profileSha256}\`.
- Runtime: Node \`${config.runtime.node}\`, ICU \`${config.runtime.icu}\`, tzdata \`${config.runtime.tzdata}\`.

### Frozen code hashes
${codeLines}

### Frozen input hashes
${frozenLines}

## Stage 2c Real W=20 Calibration and Dial-Response Mapping

${settings}

### Real W=20 distribution bands
${bands}

### Real 60-weekday stretch ceilings
${ceilings}

## Cohort Completion

- **DESIGN:** seeds 8001–8200, ${design.paths} / 200 paths, ${design.bars} bars, ${design.bytes} compressed bytes.
- **LOCKED TEST:** seeds 6001–6200, ${locked.paths} / 200 paths (**COMPLETE** at 200, generated and hashed only; price data unopened).
- **NULL:** seeds 20001–20700, ${nulls.paths} / 700 paths, ${nulls.bars} bars, ${nulls.bytes} compressed bytes.

## Fixed Checks and Results

${formatCohortChecks("DESIGN", designChecks)}

${designPassSummary}

${formatCohortChecks("NULL", nullChecks)}

${nullPassSummary}

## Separability Matrix and AUC (DESIGN only)

${auc}

## Extrapolation Coverage

${formatExtrapolation("DESIGN", designCoverage)}

${formatExtrapolation("NULL", nullCoverage)}

## Overlay Coverage

${formatOverlayCoverage(overlays)}

## Determinism Rebuild Audit (20 paths)

| Cohort | Seed | Canonical Match | Compressed Match |
| --- | ---: | --- | --- |
${audit}

## Engine CSV Parser Round-Trip (Seed 8001)

Rows parsed: ${roundtrip.rows}; CSV SHA-256: \`${roundtrip.csvSha256}\`. Round-trip match: PASS.
`;

  writeFileSync(REPORT_PATH, report);
  return report;
}

function finalizeInventory(artifactRows, pre) {
  const committed = [
    "XAUUSD_30min_2020-01-24_to_2026-10-01.csv",
    "package.json",
    "scripts/synth-v2-stage2c.mjs",
    "src/lib/synth-v2/generate.ts",
    "src/lib/synth-v2/profile.json",
    "src/lib/synth-v2/SPEC-2b.md",
    "src/lib/synth-v2/SPEC-2c.md",
    "src/lib/synth-v2/SPEC-2c.sha256",
    "src/lib/synth-v2/STAGE2C-CONFIG.json",
    "src/lib/synth-v2/STAGE2C-PRE-REGISTRATION.json",
    "src/lib/synth-v2/STAGE2C-REAL-BANDS.json",
    "src/lib/synth-v2/STAGE2C-SEEDS.json",
    "src/lib/synth-v2/STAGE2C-VOL-MAP.json",
    "src/lib/synth-v2/stage2c-data/.gitignore",
    "src/lib/synth-v2/stage2b-regimes.ts",
    "src/lib/synth-v2/stage2b-types.ts",
    "src/lib/synth-v2/stage2b-validation.ts",
    "src/lib/synth-v2/STAGE2C-REPORT.md",
  ];
  const lines = [
    `# Synth V2 Stage 2c per-seed inventory`,
    `# Preregistered spec SHA-256: ${pre.specSha256}`,
    `# Real W=20 calibration SHA-256: ${pre.realBandsSha256}`,
    `# Config SHA-256: ${pre.configSha256}`,
    `# Seed list SHA-256: ${pre.seedListSha256}`,
    `# Canonical JSON SHA-256, compressed-file SHA-256, compressed bytes, relative path`,
    ...artifactRows.map((row) => `${row.canonicalSha256}  ${row.compressedSha256}  ${row.bytes}  ${row.path}`),
    `# Committed artifacts`,
    ...committed.map((path) => `${hashFile(resolve(ROOT, path))}  ${path}`),
  ];
  writeFileSync(INVENTORY_PATH, lines.join("\n") + "\n");
}

function runBulk(inputs) {
  const { pre, config, calibration, profile, seeds } = inputs;
  const artifactRows = [];
  const setTotals = {};
  const designRecords = [];
  const nullRecords = [];
  const aucAccumulator = createStage2BAucAccumulator();
  const designCoverage = {};
  const nullCoverage = {};
  const overlays = {};
  let roundtrip;

  // Initialize or clear inventory file
  writeFileSync(INVENTORY_PATH, `# Synth V2 Stage 2c In-Flight Inventory (flushed per path)\n`);

  console.log("Generating DESIGN paths (8001-8200)...");
  for (const seed of seeds.design) {
    const encoded = encodeGeneratedPath(profile, calibration, makePathOptions("DESIGN", seed));
    const path = encoded.path;
    const fullPath = join(DATA_ROOT, artifactRelativePath("DESIGN", seed));
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, encoded.compressed);
    recordArtifact(null, artifactRows, setTotals, "DESIGN", seed, "", fullPath, encoded, path.synthetic.candles.length);
    designRecords.push(...computeStage2BPathWindows(path, profile, calibration));
    addStage2BDesignPathToAuc(aucAccumulator, path);
    aggregateCoverage(designCoverage, [path]);
    collectOverlays(overlays, path);
    verifyOverlayPlacement(path);
    if (seed === seeds.design[0]) roundtrip = parserRoundTrip(encoded, path);
  }

  console.log("Generating LOCKED TEST paths (6001-6200, hash only)...");
  for (const seed of seeds.lockedTest) {
    const encoded = encodeGeneratedPath(profile, calibration, makePathOptions("LOCKED TEST", seed));
    const fullPath = join(DATA_ROOT, artifactRelativePath("LOCKED TEST", seed));
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, encoded.compressed);
    recordArtifact(null, artifactRows, setTotals, "LOCKED TEST", seed, "", fullPath, encoded, undefined);
  }

  console.log("Generating NULL paths (20001-20700)...");
  for (const { id: regimeId } of STAGE2B_REGIMES) {
    for (const seed of seeds.nullSeedsByRegime[regimeId]) {
      const encoded = encodeGeneratedPath(profile, calibration, makePathOptions("NULL", seed, regimeId));
      const path = encoded.path;
      if (path.weekdays !== 140 || path.segments.length !== 1 || path.segments[0].regimeId !== regimeId || path.segments[0].overlays.length !== 0) {
        throw new Error(`Stage 2c NULL invariants failed for ${regimeId}/${seed}`);
      }
      const fullPath = join(DATA_ROOT, artifactRelativePath("NULL", seed, regimeId));
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, encoded.compressed);
      recordArtifact(null, artifactRows, setTotals, "NULL", seed, regimeId, fullPath, encoded, path.synthetic.candles.length);
      nullRecords.push(...computeStage2BPathWindows(path, profile, calibration));
      aggregateCoverage(nullCoverage, [path]);
    }
  }

  console.log("Running determinism rebuild audit (20 paths)...");
  const auditRows = [];
  const artifactMap = new Map(artifactRows.map((row) => [keyFor(row.set, row.seed, row.regimeId), row]));
  for (const request of seeds.rebuildVerification.paths) {
    const set = request.set;
    const regimeId = request.regimeId ?? "";
    const key = keyFor(set, request.seed, regimeId);
    const recorded = artifactMap.get(key);
    if (!recorded) throw new Error(`missing original inventory row for rebuild audit ${key}`);
    const encoded = encodeGeneratedPath(profile, calibration, makePathOptions(set, request.seed, regimeId));
    const row = {
      set,
      regimeId,
      seed: request.seed,
      canonicalMatch: encoded.canonicalSha256 === recorded.canonicalSha256,
      compressedMatch: encoded.compressedSha256 === recorded.compressedSha256,
    };
    auditRows.push(row);
    if (!row.canonicalMatch || !row.compressedMatch) throw new Error(`Stage 2c determinism rebuild mismatch for ${key}`);
  }

  console.log("Evaluating DESIGN and NULL checks...");
  const designChecks = evaluateStage2BCohort(designRecords, calibration);
  const nullChecks = evaluateStage2BCohort(nullRecords, calibration);
  const aucRows = finishStage2BAuc(aucAccumulator);

  const summaryContext = {
    pre, config, calibration, seeds, setTotals,
    designChecks, nullChecks, aucRows,
    designCoverage, nullCoverage, overlays,
    roundtrip, auditRows
  };
  makeReport(summaryContext);
  finalizeInventory(artifactRows, pre);
  console.log(`Stage 2c complete! DESIGN=${setTotals.DESIGN.paths}; LOCKED TEST=${setTotals["LOCKED TEST"].paths} (complete 200/200); NULL=${setTotals.NULL.paths}. Report written to ${REPORT_PATH}`);
}

const inputs = verifyPreRegistration();
runBulk(inputs);
