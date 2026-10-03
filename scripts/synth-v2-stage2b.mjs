import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { decodeStage2Artifact, encodeStage2Artifact } from "../src/lib/synth-v2/stage2-artifacts.ts";
import { STAGE2B_EXECUTION_CODE_PATHS, STAGE2B_FROZEN_INPUT_PATHS } from "../src/lib/synth-v2/stage2b-provenance.ts";
import { getStage2BSettings, generateStage2BPath } from "../src/lib/synth-v2/stage2b-regimes.ts";
import {
  addStage2BDesignPathToAuc,
  collectExtrapolationCoverage,
  computeStage2BPathWindows,
  createStage2BAucAccumulator,
  evaluateStage2BCohort,
  finishStage2BAuc,
  hardPairRows,
} from "../src/lib/synth-v2/stage2b-validation.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";

const ROOT = process.cwd();
const SYNTH_DIR = join(ROOT, "src/lib/synth-v2");
const DATA_ROOT = join(SYNTH_DIR, "stage2b-data");
const SOURCE_PATH = join(ROOT, "XAUUSD_30min_2020-01-24_to_2026-10-01.csv");
const EXPECTED_SOURCE_SHA256 = "cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3";
const PRE_REGISTRATION_PATH = join(SYNTH_DIR, "STAGE2B-PRE-REGISTRATION.json");
const CONFIG_PATH = join(SYNTH_DIR, "STAGE2B-CONFIG.json");
const REAL_BANDS_PATH = join(SYNTH_DIR, "STAGE2B-REAL-BANDS.json");
const SEEDS_PATH = join(SYNTH_DIR, "STAGE2B-SEEDS.json");
const REPORT_PATH = join(SYNTH_DIR, "STAGE2B-REPORT.md");
const INVENTORY_PATH = join(SYNTH_DIR, "STAGE2B-SHA256SUMS.txt");
const PART_A = [
  { id: "quiet_range", edges: "vol p10=0.00079830; trend VR-bound p10 phi=-0.06972971", k: 2, observed: 71.3 },
  { id: "normal_chop", edges: "none; vol/drift/trend at p50", k: 0, observed: 2.9 },
  { id: "trend_up", edges: "drift p90=0.01287576; trend p90 phi=0.00452192", k: 2, observed: 72.4 },
  { id: "trend_down", edges: "drift p10=-0.01234400; trend p90 phi=0.00452192", k: 2, observed: 72.7 },
  { id: "whipsaw", edges: "vol p90=0.00217564; trend VR-bound p10 phi=-0.06972971", k: 2, observed: 71.6 },
  { id: "expansion_up", edges: "vol p90=0.00217564; drift p90=0.01287576; trend p90 phi=0.00452192", k: 3, observed: 85.7 },
  { id: "expansion_down", edges: "vol p90=0.00217564; drift p10=-0.01234400; trend p90 phi=0.00452192", k: 3, observed: 84.6 },
];
const PART_A_OLD_SETTINGS = [
  ["quiet_range", "0.00079830", "0.00071501", "-0.06972971", "0.10949466", "0.02433628"],
  ["normal_chop", "0.00123003", "0.00071501", "-0.04303636", "0.10949466", "0.02433628"],
  ["trend_up", "0.00123003", "0.01287576", "0.00452192", "0.10949466", "0.02433628"],
  ["trend_down", "0.00123003", "-0.01234400", "0.00452192", "0.10949466", "0.02433628"],
  ["whipsaw", "0.00217564", "0.00071501", "-0.06972971", "0.10949466", "0.02433628"],
  ["expansion_up", "0.00217564", "0.01287576", "0.00452192", "0.10949466", "0.02433628"],
  ["expansion_down", "0.00217564", "-0.01234400", "0.00452192", "0.10949466", "0.02433628"],
];
const PART_A_WINDOWS = [
  { metric: "ATR%", bands: "p10 0.00115984; p50 0.00179888; p90 0.00308898", real: "per eligible weekday bar (79,257 values)", synthetic: "per non-blend bar within segments", status: "Matched directly" },
  { metric: "Daily drift", bands: "p10 −0.01234400; p50 0.00071501; p90 0.01287576", real: "one weekday, log(last close / first open) (1,727 values)", synthetic: "one weekday, same definition", status: "Matched directly" },
  { metric: "VR8", bands: "p10 0.65569627; p50 0.91157757; p90 1.25070824", real: "rolling 5-weekday returns (1,723 windows)", synthetic: "rolling 5-weekday windows wholly within non-blend segments", status: "Matched directly" },
  { metric: "VR16", bands: "p10 0.55335409; p50 0.86070053; p90 1.29950088", real: "rolling 5-weekday returns (1,723 windows)", synthetic: "rolling 5-weekday windows wholly within non-blend segments", status: "Matched directly" },
  { metric: "Trendiness dial constraint", bands: "VR8 0.919681–1.033335; VR16 0.899694–1.052419", real: "Stage 1b rolling 120-weekday VR p10–p90 bounds", synthetic: "Stage 2 compared 5-weekday VR windows", status: "Separate horizon mismatch" },
];
const METRICS = ["atrPercent", "drift", "varianceRatio8", "varianceRatio16"];
const METRIC_LABELS = { atrPercent: "ATR%", drift: "Drift", varianceRatio8: "VR8", varianceRatio16: "VR16" };
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
  throw new Error(`unknown Stage 2b set ${set}`);
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
  if (JSON.stringify(seeds.design) !== JSON.stringify(range(5001, 200))) throw new Error("DESIGN seed list differs from the frozen range");
  if (JSON.stringify(seeds.lockedTest) !== JSON.stringify(range(6001, 200))) throw new Error("LOCKED TEST seed list differs from the frozen range");
  const regimeIds = STAGE2B_REGIMES.map(({ id }) => id);
  if (JSON.stringify(Object.keys(seeds.nullSeedsByRegime)) !== JSON.stringify(regimeIds)) throw new Error("NULL regime seed order differs from the frozen regime order");
  for (const regimeId of regimeIds) {
    if (JSON.stringify(seeds.nullSeedsByRegime[regimeId]) !== JSON.stringify(range(7001, 100))) throw new Error(`NULL seed range differs for ${regimeId}`);
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
  const pre = readJson(PRE_REGISTRATION_PATH);
  const config = readJson(CONFIG_PATH);
  const calibration = readJson(REAL_BANDS_PATH);
  const profilePath = join(SYNTH_DIR, "profile.json");
  const profile = readJson(profilePath);
  if (pre.recordedBeforeSyntheticGeneration !== true || pre.generatedSyntheticPaths !== 0) throw new Error("Stage 2b calibration was not recorded before path generation");
  for (const path of STAGE2B_EXECUTION_CODE_PATHS) {
    const actual = hashFile(resolve(ROOT, path));
    if (actual !== pre.codeHashes[path]) throw new Error(`frozen Stage 2b code changed after registration: ${path}`);
  }
  for (const path of STAGE2B_FROZEN_INPUT_PATHS) {
    const actual = hashFile(resolve(ROOT, path));
    if (actual !== pre.frozenInputHashes[path]) throw new Error(`frozen Stage 2b input changed after registration: ${path}`);
  }
  if (hashFile(SOURCE_PATH) !== EXPECTED_SOURCE_SHA256 || pre.sourceSha256 !== EXPECTED_SOURCE_SHA256) throw new Error("frozen Stage 2b source hash mismatch");
  if (hashFile(CONFIG_PATH) !== pre.configSha256) throw new Error("Stage 2b config hash mismatch");
  if (hashFile(REAL_BANDS_PATH) !== pre.realBandsSha256) throw new Error("Stage 2b real-bands hash mismatch");
  if (hashFile(SEEDS_PATH) !== pre.seedListSha256) throw new Error("Stage 2b seed-list hash mismatch");
  if (hashFile(profilePath) !== pre.profileSha256 || profile.sourceSha256 !== EXPECTED_SOURCE_SHA256) throw new Error("Stage 1b profile provenance mismatch");
  if (calibration.specSha256 !== pre.specSha256 || calibration.profileSha256 !== pre.profileSha256 || calibration.sourceSha256 !== EXPECTED_SOURCE_SHA256) throw new Error("real calibration provenance does not match the frozen inputs");
  if (config.specSha256 !== pre.specSha256 || config.realBandsSha256 !== pre.realBandsSha256 || config.seedListSha256 !== pre.seedListSha256) throw new Error("Stage 2b config disagrees with pre-registration");
  if (config.runtime.node !== process.version || config.runtime.icu !== (process.versions.icu ?? null) || config.runtime.tzdata !== (process.versions.tz ?? null) || config.runtime.tzEnvironment !== (process.env.TZ ?? null)) {
    throw new Error("Stage 2b runtime differs from the calibrated runtime; deterministic reproduction is not guaranteed");
  }
  const specLine = readFileSync(join(SYNTH_DIR, "SPEC-2b.sha256"), "utf8").trim();
  const match = specLine.match(/^([a-f0-9]{64})\s+src\/lib\/synth-v2\/SPEC-2b\.md$/);
  if (!match || match[1] !== pre.specSha256 || hashFile(join(SYNTH_DIR, "SPEC-2b.md")) !== pre.specSha256) throw new Error("Stage 2b preregistered spec hash mismatch");
  verifySeedList(readJson(SEEDS_PATH));
  const testPath = relative(ROOT, join(DATA_ROOT, "design", "seed-5001.json.gz")).split(sep).join("/");
  mustBeIgnored(testPath);
  return { pre, config, calibration, profile, seeds: readJson(SEEDS_PATH) };
}
function aggregateCoverage(target, paths) {
  const report = collectExtrapolationCoverage(paths);
  for (const [regimeId, entry] of Object.entries(report)) {
    const current = target[regimeId] ?? { bars: 0, flaggedBars: 0, share: 0 };
    current.bars += entry.bars;
    current.flaggedBars += entry.flaggedBars;
    target[regimeId] = current;
  }
  for (const entry of Object.values(target)) entry.share = entry.bars ? entry.flaggedBars / entry.bars : 0;
}
function collectOverlays(target, path) {
  for (const segment of path.segments) {
    for (const episode of segment.overlays) {
      const item = target[episode.overlayId] ?? { episodes: 0, weekdays: 0, byRegime: {} };
      item.episodes++;
      item.weekdays += episode.endDayExclusive - episode.startDay;
      item.byRegime[segment.regimeId] = (item.byRegime[segment.regimeId] ?? 0) + episode.endDayExclusive - episode.startDay;
      target[episode.overlayId] = item;
    }
  }
}
function verifyOverlayPlacement(path) {
  const dayOffsets = [0];
  for (const count of path.schedule.barCounts) dayOffsets.push(dayOffsets.at(-1) + count);
  for (const segment of path.segments) {
    for (const episode of segment.overlays) {
      if (episode.startDay < segment.startDay || episode.endDayExclusive > segment.endDayExclusive || episode.endDayExclusive - episode.startDay < 2 || episode.endDayExclusive - episode.startDay > 5) {
        throw new Error(`invalid Stage 2b overlay range on ${segment.regimeId}`);
      }
      for (let day = episode.startDay; day < episode.endDayExclusive; day++) {
        for (let index = dayOffsets[day]; index < dayOffsets[day + 1]; index++) {
          const label = path.synthetic.labels[index];
          if (label.segmentIndex !== segment.segmentIndex || label.inBlend || !label.overlayFlags.includes(episode.overlayId)) {
            throw new Error(`Stage 2b overlay ${episode.overlayId} overlaps a blend or lost its day label`);
          }
        }
      }
    }
  }
}
function recordArtifact(artifactRows, setTotals, set, seed, regimeId, outputPath, encoded, pathBarCount) {
  const relativePath = relative(ROOT, outputPath).split(sep).join("/");
  mustBeIgnored(relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, encoded.compressed);
  const row = {
    set,
    seed,
    regimeId: regimeId ?? "",
    canonicalSha256: encoded.canonicalSha256,
    compressedSha256: encoded.compressedSha256,
    compressedBytes: encoded.compressed.byteLength,
    path: relativePath,
  };
  artifactRows.push(row);
  const totals = setTotals[set] ?? { paths: 0, bars: 0, compressedBytes: 0 };
  totals.paths++;
  totals.compressedBytes += row.compressedBytes;
  if (pathBarCount !== undefined) totals.bars += pathBarCount;
  setTotals[set] = totals;
  return row;
}
function parserRoundTrip(encoded, originalPath) {
  const decoded = decodeStage2Artifact(encoded.compressed);
  if (decoded.csv !== originalPath.synthetic.csv) throw new Error("Stage 2b parser sample changed its canonical engine CSV");
  if (decoded.candles.length !== originalPath.synthetic.candles.length || decoded.labels.length !== originalPath.synthetic.labels.length) throw new Error("Stage 2b artifact round-trip count mismatch");
  const parsed = parseCsv(decoded.csv);
  if (parsed.metadataError || parsed.candles.length !== decoded.candles.length) throw new Error(`Stage 2b engine parser round-trip failed: ${parsed.metadataError ?? parsed.candles.length}`);
  for (let index = 0; index < decoded.candles.length; index++) {
    const expected = decoded.candles[index];
    const actual = parsed.candles[index];
    if (actual.datetime !== expected.datetime || actual.open !== expected.open || actual.high !== expected.high || actual.low !== expected.low || actual.close !== expected.close) {
      throw new Error(`Stage 2b engine parser round-trip differs at row ${index}`);
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
      `${levels.volatility} (${metricValue("atrPercent", setting.dials.volatilityLevel, 4)})`,
      `${levels.drift} (${metricValue("drift", setting.dials.drift, 4)})`,
      `${levels.trend} (phi ${fmt(setting.dials.trendiness, 6)}; targets ${fmt(setting.planted.varianceRatio8, 4)}/${fmt(setting.planted.varianceRatio16, 4)})`,
      `${fmt(setting.dials.gapSize, 6)} / ${fmt(setting.overlayHighs.gapSize, 6)}`,
      `${fmt(setting.dials.newsSpikeIntensity, 6)} / ${fmt(setting.overlayHighs.newsSpikeIntensity, 6)}`,
      `vol ±${fmt(setting.wobbleWidths.volatilityLevel * 0.1, 8)}; drift ±${fmt(setting.wobbleWidths.drift * 0.1, 8)}; phi ±${fmt(setting.wobbleWidths.trendiness * 0.1, 8)}; gap ±${fmt(setting.wobbleWidths.gapSize * 0.1, 8)}; news ±${fmt(setting.wobbleWidths.newsSpikeIntensity * 0.1, 8)}`,
    ];
  });
  return `| Regime | Volatility level (ATR p17/p50/p83) | Drift (p17/p50/p83) | Trend control (phi; target VR8/VR16) | Gap p50 / overlay p90 | News p50 / overlay p90 | Additive wobble amplitudes (vol / drift / phi / gap / news) |
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
function formatPartA() {
  const edgeRows = PART_A.map((item) => {
    const expected = (1 - 0.5 ** item.k) * 100;
    return [item.id, item.edges, item.k, `${expected.toFixed(1)}%`, `${item.observed.toFixed(1)}%`, `${(item.observed - expected).toFixed(1)} pp`];
  });
  const windowRows = PART_A_WINDOWS.map((row) => [row.metric, row.bands, row.real, row.synthetic, row.status]);
  const oldSettings = mergeRows(PART_A_OLD_SETTINGS);
  return `## Part A — report-only audit of superseded Stage 2

The previous Stage 2 cohort and its checks are **SUPERSEDED**; its old LOCKED TEST is **ABANDONED** and was not opened, decompressed, or analyzed. This section uses only the preserved old report/settings and the reported per-regime extrapolation shares.

### Old per-regime edge dials vs. observed extrapolation

The old dial labels were evaluated against their source p10–p90 bands, with the trendiness dial additionally bounded by Stage 1b's VR-constrained endpoints. For an idealized regime with k independent dials planted exactly on a p10/p90 edge, additive symmetric wobble crosses the edge with probability 0.5 per dial, giving union share 1 - 0.5^k. The observed shares are the old DESIGN shares; this is a comparison, not a reanalysis of old paths.

| Old regime | Edge-positioned dials | k | 1 - 0.5^k | Observed EXTRAPOLATION | Observed − ideal |
| --- | --- | ---: | ---: | ---: | ---: |
${mergeRows(edgeRows)}

### Old per-regime dial settings, wobble, and EXTRAPOLATION rule

| Old regime | VolatilityLevel | Drift | Trendiness phi | GapSize | News intensity |
| --- | ---: | ---: | ---: | ---: | ---: |
${oldSettings}

The old source p10/p50/p90 values were volatility 0.00079830/0.00123003/0.00217564; drift −0.01234400/0.00071501/0.01287576; raw trendiness −0.09405640/−0.04303636/0.00452192; gap 0.01658094/0.10949466/0.64902937; news 0.01665558/0.02433628/0.03358876. quiet_range and whipsaw used the VR-constrained trend p10 phi −0.06972971 instead of the raw p10. Gap/news used p50 except when their overlay selected p90.

Old additive daily-knot wobble was ±10% of each source p10–p90 width: volatility ±0.000137734; drift ±0.002521976; trendiness ±0.009857832; gap ±0.063244843; news ±0.001693318. The old per-bar EXTRAPOLATION label was raised when any active dial crossed its profile p10–p90 range, or when trendiness crossed the Stage 1b VR-constrained endpoint bounds.

The owner-diagnosis reference was not separately recorded in the available repository artifacts. Interpreting it as “p10/p90 edge placement plus ±10% wobble explains the high extrapolation shares,” the figures support it as a strong approximate explanation: k=2 regimes are 71.3–72.7% vs 75.0% ideal, and k=3 regimes are 84.6–85.7% vs 87.5% ideal. Finite paths, shared/interpolated wobble, boundary blending, and dependence mean the ideal independence formula is not exact. normal_chop has k=0 and an ideal 0%, but its 2.9% observed share is consistent with p90 overlay settings and their wobble. This is not proof that edge placement is the only cause.

### Old real/synthetic statistic windows

| Statistic / dial constraint | Old real p10/p50/p90 | Real window used | Synthetic window used | Assessment |
| --- | --- | --- | --- | --- |
${mergeRows(windowRows)}

The direct old coverage comparisons matched their real and synthetic statistic horizons: ATR per eligible weekday bar, one-weekday drift, and five-weekday VR8/VR16. A separate horizon mismatch remained in the trendiness *setting*: its endpoint constraint inherited Stage 1b's 120-weekday VR bands while Stage 2's segment check used five-weekday VR windows. That is a calibration-horizon inconsistency, but it does not explain the observed EXTRAPOLATION label share as directly as the planted p10/p90 edges. No previous Stage 2 failure is patched or carried into Stage 2b.`;
}
function makeReport(context) {
  const { pre, config, calibration, seeds, setTotals, designRecords, nullRecords, designChecks, nullChecks, aucRows, designCoverage, nullCoverage, overlays, roundtrip, auditRows } = context;
  const settings = formatSettingsTable(calibration);
  const bands = formatBands(calibration);
  const ceilings = formatCeilings(calibration);
  const codeLines = Object.entries(pre.codeHashes).map(([path, hash]) => `- \`${path}\`: \`${hash}\``).join("\n");
  const frozenLines = Object.entries(pre.frozenInputHashes).map(([path, hash]) => `- \`${path}\`: \`${hash}\``).join("\n");
  const audit = auditRows.map((row) => `| ${row.set}${row.regimeId ? `/${row.regimeId}` : ""} | ${row.seed} | ${row.canonicalMatch ? "PASS" : "FAIL"} | ${row.compressedMatch ? "PASS" : "FAIL"} |`).join("\n");
  const locked = setTotals["LOCKED TEST"];
  const design = setTotals.DESIGN;
  const nulls = setTotals.NULL;
  const outOfScope = readFileSync(join(SYNTH_DIR, "STAGE2B-OUT-OF-SCOPE.txt"), "utf8").trimEnd();
  const auc = formatAuc(aucRows);
  const report = `# Synth V2 Stage 2b — preregistered W=20 regime study

Generated **2026-10-03**. The spec, real calibration, config, seeds, and executable code were hashed before any cohort paths were generated. Results below are descriptive market-statistic checks only; no detector, strategy, trade, R, P&L, or analyzer outcome was used.

${formatPartA()}

## Stage 2b provenance and frozen inputs

- Source: \`${config.sourceFile}\`; SHA-256 \`${pre.sourceSha256}\` (required checksum matched before calibration/generation).
- Timestamp interpretation: fixed EAT wall-clock (UTC+03:00), no shifts; the supplied source's (UTC) marker remains a disclosed metadata conflict.
- Spec SHA-256: \`${pre.specSha256}\` (SPEC-2b.sha256).
- Real W=20 calibration SHA-256: \`${pre.realBandsSha256}\` (STAGE2B-REAL-BANDS.json).
- Config SHA-256: \`${pre.configSha256}\` (STAGE2B-CONFIG.json).
- Seed-list SHA-256: \`${pre.seedListSha256}\` (STAGE2B-SEEDS.json).
- Stage 1b profile SHA-256: \`${pre.profileSha256}\`; source profile and Stage 1b code were consumed read-only.
- Runtime frozen: Node \`${config.runtime.node}\`, ICU \`${config.runtime.icu}\`, tzdata \`${config.runtime.tzdata}\`, TZ environment \`${config.runtime.tzEnvironment}\`.
- Calibration recorded with \`${pre.generatedSyntheticPaths}\` generated paths. Execution-code/input hashes are recorded below and in the top-level SHA inventory.

### Frozen code hashes

${codeLines}

### Frozen input hashes

${frozenLines}

## Stage 2b real W=20 calibration

Eligible source weekdays are EAT Monday–Friday with at least 24 bars; statistic windows slide one weekday at a time. Synthetic statistics use 20 consecutive full weekdays wholly inside one regime segment and exclude every bar marked in a blend. All quantiles use the frozen linear (n−1)p rule.

${bands}

The single trendiness dial is fit to each real p17/p50/p83 VR8/VR16 target pair by minimizing the two width-normalized theoretical AR(1) errors on the preregistered phi grid. Both empirical VR horizons use the same estimator for real and synthetic windows; its minimum is 2q returns. The AUC feature window also uses 48 completed one-bar returns, sufficient for VR16.

### W=20 real persistence ceilings and THIN flags

The ceiling classification uses each rolling 60-eligible-weekday stretch's median of the 41 contained W=20 windows. The n column is the number of qualifying stretches; THIN is n < 15.

${ceilings}

### Frozen seven-regime settings and wobble

The first three dial levels are empirical W=20 p17/p50/p83. Gap/news base values use their W=20 p50, and overlay highs use W=20 p90. The last column lists additive per-knot wobble amplitudes, exactly 10% of each p83–p17 width (phi width for trendiness).

${settings}

Overlays are independently selected with probability 0.25 per segment; each selected overlay is one contiguous 2–5 weekday episode, placed wholly outside transition blends. These incidence/duration values are test-coverage conventions, not market-frequency estimates. NULL paths have no overlays and are exactly 140 weekdays.

## Cohorts, outcomes, and fixed checks

- DESIGN: seeds ${seeds.design[0]}–${seeds.design.at(-1)}, ${design.paths} paths, ${design.bars.toLocaleString("en-US")} bars, ${design.compressedBytes.toLocaleString("en-US")} compressed bytes.
- LOCKED TEST: seeds ${seeds.lockedTest[0]}–${seeds.lockedTest.at(-1)}, ${locked.paths} paths, ${locked.compressedBytes.toLocaleString("en-US")} compressed bytes. **Generated and hashed only. No decode, parser, path statistic, feature, AUC, or cohort diagnostic was run on LOCKED TEST.**
- NULL: seeds ${seeds.nullSeedsByRegime[STAGE2B_REGIMES[0].id][0]}–${seeds.nullSeedsByRegime[STAGE2B_REGIMES[0].id].at(-1)} per regime; ${nulls.paths} paths total, ${nulls.bars.toLocaleString("en-US")} bars, ${nulls.compressedBytes.toLocaleString("en-US")} compressed bytes, 140 weekdays per path.
- **C1** compares synthetic intended-tercile share to the corresponding real-ceiling share; absolute tolerance 0.15. Real THIN means C1 is reported THIN and not counted as pass/fail. Above/below-ceiling failures are TOO CLEAN/TOO NOISY.
- **C2** normalized median error is (synthetic median − planted setting)/(real p83−p17), fixed tolerance ±0.25.
- **C3** is the strict pooled LOW < NORMAL < HIGH realized-median ordering, evaluated separately per cohort/statistic.
- DEGRADED is reported without repair. DESIGN and NULL remain separate.

${formatCohortChecks("DESIGN", designChecks)}

${formatCohortChecks("NULL", nullChecks)}

### Overlay coverage (DESIGN only)

${formatOverlayCoverage(overlays)}

${formatExtrapolation("DESIGN", designCoverage)}

${formatExtrapolation("NULL", nullCoverage)}

## DESIGN-only separability (single-feature AUC)

Features are causal: at every fourth non-blend observation bar from index 61 onward, they use only the immediately preceding 48 completed bars/returns; index 61 is the first complete 48-value ATR window after Wilder warm-up. There is no same-bar or future input. Drift z-score uses the previous 48 close-to-close returns divided by their sample SD; VR8 and VR16 use those same 48 returns. A pair is INSEPARABLE when its best oriented single-feature AUC is below 0.60. LOCKED TEST is not consulted.

${auc}

## Determinism, parser, and integrity

- Cohort artifact encoding is canonical JSON compressed with gzip level 9 and mtime 0. Canonical JSON and compressed bytes are SHA-256 inventoried for every seed.
- Twenty unique, pre-listed non-LOCKED DESIGN/NULL paths were rebuilt from the frozen inputs/config. Both canonical and compressed SHA-256 values must match the original inventory:

| Rebuild set/regime | Seed | Canonical hash | Compressed hash |
| --- | ---: | --- | --- |
${audit}

- Rebuild determinism: **${auditRows.every((row) => row.canonicalMatch && row.compressedMatch) ? "PASS" : "FAIL"} (${auditRows.length}/20)**.
- Engine CSV parser round-trip on DESIGN seed 5001: **PASS**, ${roundtrip.rows.toLocaleString("en-US")} candles, exact timestamp/OHLC match; CSV SHA-256 \`${roundtrip.csvSha256}\`.
- LOCKED TEST compressed files were not decompressed at any time; audit and parser samples are DESIGN/NULL only.
- Previous Stage 2 repairs after outcomes: **0**. Stage 2b does not repair degraded results.

### Per-seed byte inventory

\`STAGE2B-SHA256SUMS.txt\` contains one row per artifact, each with canonical JSON SHA-256, compressed-file SHA-256, bytes, and path. It also includes the hashes for committed source/config/report files. Path data under \`stage2b-data/\` is ignored and is not committed.

## Assumptions, limitations, and out-of-scope working-tree edits

- EAT is fixed +03:00 per the owner; source rows were not shifted. The conflicting source (UTC) marker remains an unresolved provenance issue.
- The auxiliary W=20 gap/news statistics are used only for dial base/overlay/wobble/extrapolation; they are not C1–C3 targets.
- Wobble and overlay probabilities/durations are fixed coverage conventions, not estimates of future market regimes or event frequencies.
- News is a source-normalized tail proxy using the frozen Stage 1b threshold, not an economic-news calendar or event attribution.
- Runtime Intl/IANA exchange seasonality uses the frozen recorded Node/ICU/tzdata environment; tzdata was not independently pinned by Stage 1b.
- The Stage 1b source profile/generator, engine, strategies, UI, and Stage 1 library were not modified by this work. The old Stage 2 cohort is superseded; its LOCKED TEST remains abandoned and unopened.
- Pre-existing out-of-scope worktree paths recorded at task entry (not edited or staged here):

\`\`\`text
${outOfScope}
\`\`\`

## Output artifacts

- \`SPEC-2b.md\` / \`SPEC-2b.sha256\`: preregistered protocol, SHA-256 \`${pre.specSha256}\`.
- \`STAGE2B-REAL-BANDS.json\`: W=20 real calibration, SHA-256 \`${pre.realBandsSha256}\`.
- \`STAGE2B-CONFIG.json\`: frozen cohort/check configuration, SHA-256 \`${pre.configSha256}\`.
- \`STAGE2B-PRE-REGISTRATION.json\`: code/input/config hashes recorded before generation.
- \`STAGE2B-SEEDS.json\`: fixed seeds and 20 rebuild paths.
- \`STAGE2B-SHA256SUMS.txt\`: per-seed canonical/compressed SHA-256 inventory and committed-artifact hashes.
- Generated compressed path files are local ignored data only; they are not committed.
`;
  writeFileSync(REPORT_PATH, report);
  return report;
}
function inventoryText(artifactRows, pre) {
  const lines = [
    "# Stage 2b SHA-256 inventory (tabs separate fields)",
    "# Path data are local/ignored and are not committed; each output row contains canonical JSON SHA-256, compressed-file SHA-256, compressed bytes, and repo-relative path.",
    `# source_sha256\t${pre.sourceSha256}`,
    `# spec_sha256\t${pre.specSha256}`,
    `# real_bands_sha256\t${pre.realBandsSha256}`,
    `# config_sha256\t${pre.configSha256}`,
    `# seed_list_sha256\t${pre.seedListSha256}`,
    "# canonical_json_sha256\tcompressed_file_sha256\tcompressed_bytes\tpath",
  ];
  for (const row of artifactRows) lines.push(`${row.canonicalSha256}\t${row.compressedSha256}\t${row.compressedBytes}\t${row.path}`);
  lines.push("", "# Committed artifact SHA-256 (standard two-space sha256sum format)");
  const committed = [
    ...STAGE2B_EXECUTION_CODE_PATHS,
    ...STAGE2B_FROZEN_INPUT_PATHS,
    "src/lib/synth-v2/STAGE2B-CONFIG.json",
    "src/lib/synth-v2/STAGE2B-PRE-REGISTRATION.json",
    "src/lib/synth-v2/STAGE2B-REAL-BANDS.json",
    "src/lib/synth-v2/STAGE2B-OUT-OF-SCOPE.txt",
    "src/lib/synth-v2/QUESTIONS.md",
    "src/lib/synth-v2/README.md",
    "src/lib/synth-v2/STAGE2B-REPORT.md",
  ].filter((path, index, all) => all.indexOf(path) === index);
  for (const path of committed) lines.push(`${hashFile(resolve(ROOT, path))}  ${path}`);
  return `${lines.join("\n")}\n`;
}
function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith("--set=")) options.set = arg.slice("--set=".length);
    else if (arg.startsWith("--seed=")) options.seed = Number(arg.slice("--seed=".length));
    else if (arg.startsWith("--regime=")) options.regimeId = arg.slice("--regime=".length);
    else if (arg.startsWith("--out=")) options.out = arg.slice("--out=".length);
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}
function normalizeSet(raw) {
  if (raw === "DESIGN") return "DESIGN";
  if (raw === "LOCKED_TEST") return "LOCKED TEST";
  if (raw === "NULL") return "NULL";
  throw new Error("--set must be DESIGN, LOCKED_TEST, or NULL");
}
function runSingle(options, inputs) {
  const set = normalizeSet(options.set);
  const seed = options.seed;
  if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
  const { seeds, profile, calibration } = inputs;
  if (set === "DESIGN" && !seeds.design.includes(seed)) throw new Error(`seed ${seed} is not in DESIGN`);
  if (set === "LOCKED TEST" && !seeds.lockedTest.includes(seed)) throw new Error(`seed ${seed} is not in LOCKED TEST`);
  if (set === "NULL") {
    if (!STAGE2B_REGIMES.some(({ id }) => id === options.regimeId)) throw new Error("--regime is required for NULL and must be a frozen Stage 2b regime id");
    if (!seeds.nullSeedsByRegime[options.regimeId].includes(seed)) throw new Error(`seed ${seed} is not in NULL/${options.regimeId}`);
  } else if (options.regimeId) throw new Error("--regime is valid only with --set=NULL");
  const expected = artifactRelativePath(set, seed, options.regimeId ?? "");
  const outputPath = options.out ? resolve(ROOT, options.out) : join(DATA_ROOT, expected);
  const dataPrefix = `${DATA_ROOT}${sep}`;
  if (!outputPath.startsWith(dataPrefix)) throw new Error("--out must remain under the ignored stage2b-data directory");
  const rel = relative(ROOT, outputPath).split(sep).join("/");
  mustBeIgnored(rel);
  const encoded = encodeGeneratedPath(profile, calibration, makePathOptions(set, seed, options.regimeId));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, encoded.compressed);
  console.log(JSON.stringify({ set, seed, regimeId: options.regimeId ?? null, canonicalSha256: encoded.canonicalSha256, compressedSha256: encoded.compressedSha256, compressedBytes: encoded.compressed.byteLength, path: rel }, null, 2));
  // LOCKED TEST intentionally exits without decoding or analyzing the generated artifact.
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

  for (const seed of seeds.design) {
    const encoded = encodeGeneratedPath(profile, calibration, makePathOptions("DESIGN", seed));
    const path = encoded.path;
    recordArtifact(artifactRows, setTotals, "DESIGN", seed, "", join(DATA_ROOT, artifactRelativePath("DESIGN", seed)), encoded, path.synthetic.candles.length);
    designRecords.push(...computeStage2BPathWindows(path, profile, calibration));
    addStage2BDesignPathToAuc(aucAccumulator, path);
    aggregateCoverage(designCoverage, [path]);
    collectOverlays(overlays, path);
    verifyOverlayPlacement(path);
    if (seed === seeds.design[0]) roundtrip = parserRoundTrip(encoded, path);
  }

  // LOCKED TEST: generation and hashing only. No calls below inspect candles, labels, statistics, or features.
  for (const seed of seeds.lockedTest) {
    const encoded = encodeGeneratedPath(profile, calibration, makePathOptions("LOCKED TEST", seed));
    recordArtifact(artifactRows, setTotals, "LOCKED TEST", seed, "", join(DATA_ROOT, artifactRelativePath("LOCKED TEST", seed)), encoded, undefined);
  }

  for (const { id: regimeId } of STAGE2B_REGIMES) {
    for (const seed of seeds.nullSeedsByRegime[regimeId]) {
      const encoded = encodeGeneratedPath(profile, calibration, makePathOptions("NULL", seed, regimeId));
      const path = encoded.path;
      if (path.weekdays !== 140 || path.segments.length !== 1 || path.segments[0].regimeId !== regimeId || path.segments[0].overlays.length !== 0) {
        throw new Error(`Stage 2b NULL invariants failed for ${regimeId}/${seed}`);
      }
      recordArtifact(artifactRows, setTotals, "NULL", seed, regimeId, join(DATA_ROOT, artifactRelativePath("NULL", seed, regimeId)), encoded, path.synthetic.candles.length);
      nullRecords.push(...computeStage2BPathWindows(path, profile, calibration));
      aggregateCoverage(nullCoverage, [path]);
    }
  }

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
    if (!row.canonicalMatch || !row.compressedMatch) throw new Error(`Stage 2b determinism rebuild mismatch for ${key}`);
  }

  const designChecks = evaluateStage2BCohort(designRecords, calibration);
  const nullChecks = evaluateStage2BCohort(nullRecords, calibration);
  const aucRows = finishStage2BAuc(aucAccumulator);
  const summaryContext = { pre, config, calibration, seeds, setTotals, designRecords, nullRecords, designChecks, nullChecks, aucRows, designCoverage, nullCoverage, overlays, roundtrip, auditRows };
  makeReport(summaryContext);
  writeFileSync(INVENTORY_PATH, inventoryText(artifactRows, pre));
  console.log(`Stage 2b complete. DESIGN=${setTotals.DESIGN.paths}; LOCKED TEST=${setTotals["LOCKED TEST"].paths} (hash-only); NULL=${setTotals.NULL.paths}. Report: ${relative(ROOT, REPORT_PATH)}.`);
}

const { pre, config, calibration, profile, seeds } = verifyPreRegistration();
const options = parseArgs(process.argv.slice(2));
if (options.set !== undefined) {
  if (options.seed === undefined) throw new Error("single-path mode requires --seed");
  runSingle(options, { pre, config, calibration, profile, seeds });
} else {
  if (options.seed !== undefined || options.regimeId !== undefined || options.out !== undefined) throw new Error("--seed/--regime/--out require --set");
  runBulk({ pre, config, calibration, profile, seeds });
}
