#!/usr/bin/env node
/**
 * G0 Amendment 8 Stage 2 audit. This computes only Map/state diagnostics and
 * data-role counts; it does not emit strategy signals, trades, or outcomes.
 * The old continuous-Map agreement is report-only and is never fed to A8.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { MAP, ROLES, EXIT_HARNESS } from "./frozen.mjs";
import { splitDevSegments, mapDevSegments, summarizeSegments } from "./lib/dev-segments.mjs";
import { countSealedSpreadMonths } from "./lib/dev-pipeline.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");
const barsPath = join(NORM, "xauusd-m30-eat.csv");
const mapPath = join(OUT, "map-validation.json");
const spreadPath = join(OUT, "spread-table.json");
for (const p of [barsPath, mapPath, spreadPath]) if (!existsSync(p)) throw new Error(`missing ${p}; run the appropriate M1/Map inputs first`);

function readBars(path) {
  const out = [];
  for (const f of dataLines(readFileSync(path, "utf8"), { delimiter: "," })) {
    if (f[0] === "datetime") continue;
    const [o, h, l, c, v] = f.slice(1, 6).map(num);
    if ([o, h, l, c].some((x) => x === undefined)) continue;
    out.push({ datetime: f[0], o, h, l, c, v: v ?? 0 });
  }
  return out;
}
const bars = readBars(barsPath);
const segments = splitDevSegments(bars);
if (segments.length !== 4) throw new Error(`expected four contiguous DEV segments, found ${segments.length}: ${segments.map((x) => x.id).join(", ")}`);
const segmentMaps = mapDevSegments(segments, MAP);
const summary = summarizeSegments(segments, segmentMaps);
// A full-feed continuous-map comparator would compute features on sealed rows;
// it is deliberately omitted under the strict role boundary.
const pins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const pinnedMonths = Object.keys(pins).filter((key) => /^bid_\d{4}_\d{2}$/.test(key)).map((key) => key.slice(4)).sort();
const spreadMonths = countSealedSpreadMonths(JSON.parse(readFileSync(spreadPath, "utf8")), ROLES.DEV, pinnedMonths);
const oldMapValidation = JSON.parse(readFileSync(mapPath, "utf8"));
const report = {
  generatedAt: new Date().toISOString(),
  stage: "A8_STAGE_2_SEGMENT_AUDIT",
  strategyOutcomesRun: false,
  roles: { devYears: ROLES.DEV, sealedYears: [...ROLES.HOLDOUT, ...ROLES.VAL, ...ROLES.STRESS].sort((a,b)=>a-b) },
  segmentRule: "split at every non-DEV bar; Map is independently recomputed inside each contiguous DEV segment",
  boundaries: segments.map((s) => ({ id: s.id, firstDatetime: s.bars[0].datetime, lastDatetime: s.bars.at(-1).datetime, globalStart: s.globalStart, globalEndExclusive: s.globalEnd })),
  eligibility: { warmupBars: MAP.warmupBars, tailBars: EXIT_HARNESS.maxHoldBars, rule: "local index >= 1,000 and localIndex + 96 < segment length" },
  ...summary,
  oldContinuousAgreement: null,
  oldContinuousAgreementOmitted: "A full-feed comparison would compute features on non-DEV rows; it is prohibited and was not run.",
  devOnlyMapStatesSha256: oldMapValidation.statesSha256 ?? null,
  spreadMonths,
  supersededForA8Verification: [
    "artifacts/map-compass/random-baseline.json",
    "artifacts/map-compass/random-baseline-daily-sums.json",
    "artifacts/map-compass/amendment7/year-matched-baseline.json",
    "artifacts/map-compass/signal-counts.json",
    "artifacts/map-compass/power-projection.json",
    "artifacts/map-compass/power-curve.json",
    "artifacts/map-compass/amendment6/random-baseline.json",
    "artifacts/map-compass/amendment6/signal-counts.json",
    "artifacts/map-compass/amendment6/slot-model.json",
  ],
  oldArtifactsPreservedAsHistory: true,
};
writeFileSync(join(OUT, "a8-segment-audit.json"), JSON.stringify(report, null, 2) + "\n");
const md = [
  "# G0 Amendment 8 — DEV segment audit (Stage 2)",
  "",
  `Generated ${report.generatedAt}. **No strategy signals, trades, or outcomes were generated.**`,
  "",
  "## Frozen segment rule",
  "",
  "Split at every non-DEV gap; recompute Map independently per contiguous DEV segment. Entry bars require local index ≥1,000 and 96 subsequent bars within that segment.",
  "",
  "| Segment | First bar | Last bar | Bars | Years / bars | Warm-up excluded | Tail excluded | Eligible bars |",
  "|---|---|---|---:|---|---:|---:|---:|",
  ...report.bySegment.map((s) => `| ${s.id} | ${segments.find(x=>x.id===s.id).bars[0].datetime} | ${segments.find(x=>x.id===s.id).bars.at(-1).datetime} | ${s.bars} | ${Object.entries(s.byYear).map(([y,x])=>`${y}: ${x.bars} (${x.eligibleBars} eligible)`).join("; ")} | ${s.warmupBarsLost} | ${s.tailBarsLost} | ${s.eligibleBars} |`),
  "",
  `**Totals:** ${summary.totalBars} DEV bars; ${summary.warmupLost} lost to segment warm-up; ${summary.tailLost} lost to segment tails; ${summary.eligibleBars} eligible entry bars.`,
  "",
  "## Full-feed Map comparator",
  "",
  "Omitted. Computing a continuous Map over the full feed would derive features from non-DEV rows, which is prohibited. No continuous comparator was run; the DEV-only state hash is recorded in the JSON artifact.",
  "",
  "## Spread-sample months in sealed years (cost data only)",
  "",
  `Of the ${spreadMonths.total} pinned spread-sample months, ${spreadMonths.pairedObservedCount} have matched M1 bid/ask observations and ${spreadMonths.noPairedM1Count} lack a paired sample in the current cost input. ${spreadMonths.sealedCount} of the 44 selected months are in sealed (non-DEV) years: ${spreadMonths.sealedMonths.join(", ") || "none"}; ${spreadMonths.sealedPairedMonths.length} of these have paired observations. These are cost-model observations only, not strategy outcomes or entry/exit prices.`,
  "",
  "## Superseded historical inputs",
  "",
  "The prior random baseline, year-matched baseline, power and signal-count files remain byte-preserved. They are superseded for A8 verification because they were not built with the A8 segment-boundary rules.",
  "",
  "```text",
  ...report.supersededForA8Verification,
  "```",
  "",
].join("\n");
writeFileSync(join(ROOT, "docs/G0-AMENDMENT-8-SEGMENTS.md"), md);
console.log(md);
