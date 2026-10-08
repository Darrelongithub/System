#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INPUT_FILE,
  INPUT_SHA256,
  SPEC_SHA256,
  sha256,
} from "../src/lib/regime-detector-eval/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "src/lib/regime-detector-eval");
const part2 = JSON.parse(await readFile(path.join(DIR, "part2-results.json"), "utf8"));
const part3 = JSON.parse(await readFile(path.join(DIR, "part3-results.json"), "utf8"));
const specBytes = await readFile(path.join(DIR, "SPEC-RD.md"));
if (sha256(specBytes) !== SPEC_SHA256)
  throw new Error("SPEC-RD changed; refusing to report against a different protocol");
const guideBytes = await readFile(path.join(DIR, "frozen-guide.md"));
const guideSha256 = sha256(guideBytes);

const round = (value, digits = 4) => (Number.isFinite(value) ? value.toFixed(digits) : "—");
const comma = (value) => (Number.isFinite(value) ? value.toLocaleString("en-US") : "—");
const percent = (value, digits = 2) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
const escapeCell = (value) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
const mdTable = (headers, rows) =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");

function formatRun(value) {
  return `${comma(value.n)} · p10 ${round(value.p10, 1)} · med ${round(value.p50, 1)} · p90 ${round(value.p90, 1)}`;
}

const labels = [
  "bullish-trend",
  "bearish-trend",
  "range",
  "high-volatility",
  "compression",
  "transition",
];
const descriptionScopes = part2.descriptions;
const frequencyRows = [];
for (const description of descriptionScopes) {
  for (const label of labels) {
    frequencyRows.push([
      description.scope,
      comma(description.bars),
      label,
      comma(description.labelCounts[label]),
      percent(description.labelShares[label]),
      percent(description.transitionShare),
      comma(description.flips),
      round(description.flipsPer1000Bars, 3),
    ]);
  }
}
const frequencyTable = mdTable(
  [
    "Scope",
    "Bars",
    "Committed label",
    "Count",
    "Share",
    "Transition share",
    "Flips",
    "Flips / 1,000 bars",
  ],
  frequencyRows,
);

const runRows = [];
for (const description of descriptionScopes) {
  for (const label of labels) {
    const run = description.runLengths[label];
    runRows.push([
      description.scope,
      label,
      comma(run.runCount),
      formatRun(run.bars),
      formatRun(run.weekdayEquivalents),
    ]);
  }
}
const runTable = mdTable(
  [
    "Scope",
    "Label",
    "Runs",
    "Length in bars (n · p10 · median · p90)",
    "Nominal 30-min weekdays (bars / 48)",
  ],
  runRows,
);

const confidenceRows = [];
for (const description of descriptionScopes) {
  confidenceRows.push([description.scope, "ALL", description.confidence]);
  for (const label of labels) {
    confidenceRows.push([description.scope, label, description.confidenceByLabel[label]]);
  }
}
const confidenceTable = mdTable(
  ["Scope", "Committed label", "Confidence (n · mean · p10 · p50 · p90)"],
  confidenceRows.map(([scope, label, distribution]) => [
    scope,
    label,
    `${comma(distribution.n)} · ${round(distribution.mean, 4)} · ${round(distribution.p10, 4)} · ${round(distribution.p50, 4)} · ${round(distribution.p90, 4)}`,
  ]),
);

const allForwardRows = [
  ...[48, 240].flatMap((horizon) => part3.byHorizon[horizon].flatMap((cell) => cell.rows)),
];
const metricOrder = [
  "forward_volatility_ratio",
  "forward_trend_efficiency",
  "signed_forward_return_atr",
  "bullish_minus_bearish_signed_return_atr",
];
const metricTitles = {
  forward_volatility_ratio: "Forward realized-volatility ratio",
  forward_trend_efficiency: "Forward trend efficiency",
  signed_forward_return_atr: "Signed forward return in ATR(14) units",
  bullish_minus_bearish_signed_return_atr: "Bullish-minus-bearish SATR contrast",
};
function b2Text(row) {
  if (!row.b2) return "n/a";
  if (row.metric === "forward_volatility_ratio") {
    const { low, high } = row.b2;
    return `low n=${low.n}, mean=${round(low.mean)}, vs B1=${round(low.effectVsB1)}; high n=${high.n}, mean=${round(high.mean)}, vs B1=${round(high.effectVsB1)}`;
  }
  const { positiveN, negativeN, positiveMean, negativeMean, positiveMinusNegative } = row.b2;
  return `n+=${positiveN}, n-=${negativeN}; +=${round(positiveMean)}, -=${round(negativeMean)}, Δ=${round(positiveMinusNegative)}`;
}
function scopeSortKey(value) {
  if (value === "FULL") return 0;
  if (value === "H1") return 1;
  if (value === "H2") return 2;
  return 3 + Number(value.slice(1));
}
const forwardTables = [];
for (const metric of metricOrder) {
  const metricRows = allForwardRows
    .filter((row) => row.metric === metric)
    .sort(
      (a, b) =>
        scopeSortKey(a.scope) - scopeSortKey(b.scope) ||
        a.horizon - b.horizon ||
        labels.indexOf(a.label) - labels.indexOf(b.label),
    );
  if (!metricRows.length) continue;
  const dataRows = metricRows.map((row) => [
    row.scope,
    row.horizon,
    row.label,
    comma(row.n),
    row.nBull === undefined ? "" : `${comma(row.nBull)} / ${comma(row.nBear)}`,
    round(row.conditionalMean, 5),
    round(row.b1UnconditionalMean, 5),
    round(row.effect, 5),
    Array.isArray(row.ci95)
      ? `${round(row.ci95[0], 5)} to ${round(row.ci95[1], 5)} (${comma(row.bootstrapValidReplicates)}/2,000 valid)`
      : "—",
    b2Text(row),
    `${round(row.b3P05, 5)} / ${round(row.b3P95, 5)}; rank ${round(row.b3ObservedPercentile, 2)}%; ${comma(row.b3FiniteShifts)}/1,000 valid`,
    `${row.verdict}${row.sampleFlag === "THIN" ? " · THIN" : ""}`,
  ]);
  forwardTables.push(
    `### ${metricTitles[metric]}\n\n${mdTable(
      [
        "Scope",
        "H",
        "Label",
        "n",
        "n bull / bear",
        "Conditional mean",
        "B1 mean",
        "Effect",
        "95% block CI (valid bootstrap n)",
        "B2 comparator",
        "B3 p05 / p95; observed rank (valid shifts)",
        "Verdict / sample",
      ],
      dataRows,
    )}`,
  );
}

const claimRows = labels.map((label) => [
  label,
  "No explicit forward claim in the guide",
  "DESCRIPTIVE-ONLY",
]);
const claimTable = mdTable(["Label", "Guide-derived forward claim", "Verdict"], claimRows);

const causality = part2.causality;
const data = part2.dataInfo;
const part2Summary = [
  `- Execution: ${comma(causality.batches.length)} isolated Node processes with batch sizes ${part2.execution.batchSizes.join(", ")}; the exact deterministic cutpoint set was revalidated and merged.`,
  `- Truncation checks: ${comma(causality.cutpoints.length)} unique cut points; ${comma(causality.prefixChecks)} prefix bar-state comparisons.`,
  `- Prefix truncation mismatches: **${comma(causality.prefixMismatchBars)}** bar-state differences; ${comma(causality.prefixMismatchCuts)}/${comma(causality.cutpoints.length)} cut points affected.`,
  `- Random-suffix mutation mismatches: **${comma(causality.suffixMutationMismatchBars)}** bar-state differences; ${comma(causality.suffixMutationMismatchCuts)}/${comma(causality.cutpoints.length)} cut points affected.`,
  `- Total mismatches: **${comma(causality.mismatches)}**; causal check clean: **${causality.clean ? "YES" : "NO"}**.`,
  `- Seeds: cut points ${causality.randomSeed}; suffix mutation ${causality.mutationSeed}. Prefix/suffix fields compared at every bar through each cutoff: committed label, candidate, changed flag, pending regime/count, confidence, and candidate confidence.`,
].join("\n");

const thinCount = allForwardRows.filter((row) => row.sampleFlag === "THIN").length;
const forwardSummaryRows = [
  ["Rows/cells", comma(allForwardRows.length)],
  ["THIN cells (<200 non-overlapping starts)", comma(thinCount)],
  ["H horizons", part3.horizons.join(", ")],
  [
    "Placebo shifts",
    `${part3.placebo.shifts} unique offsets; D5=${part3.placebo.minWeekdayOffsetRows} rows`,
  ],
  [
    "Bootstrap",
    `${part3.bootstrap.resamples} ISO EAT week-block resamples; 95% percentile intervals`,
  ],
  [
    "Verdicts",
    "All six labels DESCRIPTIVE-ONLY; Part 3 values are conditional descriptive statistics, not predictive claim tests",
  ],
];
const forwardSummary = mdTable(["Item", "Result"], forwardSummaryRows);

const part4Rows = [
  ["trend_up", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
  ["trend_down", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
  ["expansion_up", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
  ["expansion_down", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
  ["whipsaw", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
  ["quiet_range", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
  ["normal_chop", "N/A", "N/A", "N/A", "NOT RUN / UNVERIFIED"],
];
const part4Table = mdTable(
  ["Planted regime", "Hit rate", "Median 3-confirmation delay", "NULL flips / weekday", "Status"],
  part4Rows,
);

const report = `# Market-regime detector evaluation

**Scope:** market statistics only; no trade, strategy, R, P&L, or backtester data was used as an evaluation input or result. The evaluation ran against an immutable pre-registered specification and a hash-pinned OHLC archive.

## Executive result

The guide makes no explicit claim about what happens *after* any label. Under the preregistered rule, all six labels are therefore **DESCRIPTIVE-ONLY**. The forward tables are provided as requested conditional market statistics, but they are not treated as predictive pass/fail tests. The causality check recorded ${comma(part2.causality.mismatches)} mismatches and is ${part2.causality.clean ? "CLEAN" : "NOT CLEAN"}; sample cells below 200 non-overlapping windows are marked THIN.

The frozen benchmark bars remain documented but are inapplicable without an explicit forward claim: the hypothesized sign, 95% CI excluding the unconditional value, effect beyond the relevant B3 tail, and an effect at least as large as B2; FVRR thresholds of ≥1.15 (high-volatility) or ≤0.90 (calm); and, for a directional claim, bullish-minus-bearish SATR ≥0.10 ATR at H=240. Claim-bearing tests would have to meet the preregistered H1/H2 and horizon requirements. No bar is used to turn these descriptive results into predictive validation.

## 1. Provenance and frozen inputs

- Input: ${INPUT_FILE} — SHA-256 ${INPUT_SHA256} (verified).
- Parsed OHLC rows: ${comma(data.parsedDataRows)}; EAT coverage ${data.firstTimestampEAT} through ${data.lastTimestampEAT}; documented section lines skipped: ${comma(data.skippedDocumentedSectionLines)}.
- Volume: ${data.volumeAvailable ? "present" : "no volume column; all detector volume values are null"}. Only timestamp and raw OHLC enter the detector; reliability and every derived/annotation column are ignored.
- Detector tree SHA-256: ${data.detectorTreeSha256}; defaults SHA-256: ${data.defaultOptionsSha256}.
- Frozen default configuration: frozen-default-config.json; exact detector copy: frozen-detector/.
- Threshold/window line inventory and source-history limitation: [PROVENANCE.md](./PROVENANCE.md).
- Preregister: [SPEC-RD.md](./SPEC-RD.md), SHA-256 ${data.specSha256} (verified by the run script and recorded in [SPEC-RD.sha256](./SPEC-RD.sha256)).
- The detector/guide were untracked at the start and have no available Git path history. It is not possible to establish whether thresholds were ever chosen/tuned after viewing XAUUSD gold data or on what period; no evidence of such tuning was found in the available detector/guide materials. This is unknown, not proof of no tuning.

## 2. Part 1 — pre-registered claim map and verdicts

The guide describes current-state evidence and explicitly recommends separate validation before strategy use; it does not state forward continuation, expansion, persistence, or mean-reversion claims. No claim was invented from a regime name.

${claimTable}

## 3. Part 2 — causality and description

${part2Summary}

Seeds and the exact 200 cut indexes are retained in [part2-results.json](./part2-results.json). This checks committed label/candidate/hysteresis state and scores on prefixes; it does not certify the detector against any external causal implementation.

### Label frequencies and flips (all years)

${frequencyTable}

### Run lengths (all years)

Weekday equivalents are nominal 30-minute weekday bars (bars / 48), not elapsed calendar weekdays. Annual runs are clipped at year boundaries; clipped fragments are retained.

${runTable}

### Confidence distributions (all years)

The detector's confidence is a rule-support score, not a probability. Rows show n, mean, P10, P50, P90.

${confidenceTable}

## 4. Part 3 — real-gold forward statistics

The exact formulas, horizons, non-overlapping schedule, scope boundary policy, B1/B2/B3 definitions, randomization seeds, uncertainty method and claim verdict bars are frozen in SPEC-RD.md. Statistics are computed on the committed label at close t and returns from t+1 onward. The outcome table is descriptive because no label has a guide-stated forward claim.

${forwardSummary}

${forwardTables.join("\n\n")}

Machine-readable full cell table: [forward-cells.csv](./forward-cells.csv). Raw aggregate structures, the exact 1,000 B3 offsets, each cell’s 1,000-position null-effect array (null where an offset yields an undefined cell), B1/B2/B3 comparisons and bootstrap metadata: [part3-results.json](./part3-results.json). B3 percentile summaries use finite null draws only.

## 5. Part 4 — synthetic secondary analysis

The required commit object f640c4d is not present in the local Git object database (git cat-file -e f640c4d^{commit} failed). Network access outside the npm registry was not used, and the Part 4 prerequisite—verifying the generator source hash against that commit—could not be satisfied. Per the preregistered rule, no new synthetic paths or NULL flips were generated and generator files were not changed.

${part4Table}

## 6. Assumptions, limitations and unverified items

- Timestamp date/week/split grouping uses the input's EAT wall-clock calendar with no timezone shift. Horizon and detector windows are measured in source bars.
- All valid OHLC rows, including any row carrying an unreliable annotation, are retained; no OHLC repair, sorting, duplicate removal, or reliability filtering is performed. Input hash, chronology, geometry and positive-price checks are enforced.
- The dataset has no volume column, so the detector receives null volume throughout.
- The guide's lack of explicit forward claims makes the required per-label pass bars inapplicable. Conditional effects and B2/B3 comparisons are descriptive diagnostics only; they must not be described as validation of predictive ability.
- Detector/guide tuning provenance is unknown because those source files had no available Git history at the start. The exact guide snapshot is [frozen-guide.md](./frozen-guide.md), SHA-256 ${guideSha256}; guide-source-manifest.json also binds it to the original docs path.
- Part 4 is unverified and not run because f640c4d is unavailable locally.
- No external price source or other network source was accessed. The required GitHub push/verification is reported in the delivery message; Part 1 checkpoint commit was 503ddcfd0a2c54462d4bb713528402602cb825ca.
- Dependency setup reported 3 npm audit advisories (2 high, 1 critical); dependencies were not changed beyond the required clean install.

## 7. Reproducibility and inventory

Run the complete analysis with:

node --max-old-space-size=2800 --expose-gc --experimental-strip-types --import ./tests/register.mjs scripts/regime-eval-all.mjs

The resumable orchestrator reuses completed batches and validates the exact seeded cutpoint union before merging. This execution reused seven completed 20-cutpoint processes and ran the remaining 60 cut points as twelve five-cutpoint processes; a fresh run uses forty five-cutpoint processes. It then runs Part 3, with all batch files retained. Then generate this report with node scripts/regime-eval-report.mjs and write the hash inventory with node scripts/regime-eval-inventory.mjs. [SHA256SUMS.txt](./SHA256SUMS.txt) uses standard sha256sum file entries, including the canonical detector-tree and guide-source manifest files; verify it from the repository root with sha256sum -c src/lib/regime-detector-eval/SHA256SUMS.txt. The inventory intentionally does not hash itself.

## 8. Post-analysis software verification

- Clean dependency install: npm ci passed; npm reported 3 audit advisories (2 high, 1 critical).
- TypeScript: npx tsc --noEmit passed.
- Full repository regression suite: 246 passed, 0 failed. Evaluation-specific tests: 7 passed, 0 failed.
- Scoped ESLint, Prettier and JavaScript syntax checks passed for the new evaluation code.

These are software QA checks only; their outputs were not used to calculate any market-statistical result.
`;

await writeFile(path.join(DIR, "forward-cells.md"), `${forwardTables.join("\n\n")}\n`);
await writeFile(path.join(DIR, "REPORT.md"), report);
console.log(
  `Wrote REPORT.md and forward-cells.md; ${allForwardRows.length} Part 3 cells, ${thinCount} THIN.`,
);
