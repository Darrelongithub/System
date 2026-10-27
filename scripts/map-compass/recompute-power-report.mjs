#!/usr/bin/env node
/**
 * G0 AMENDMENT 2 — recompute power-projection.json as REPORT-ONLY.
 *
 * The normalized data (gitignored, ~264MB) may not be present. This script
 * re-derives ONLY the report-only block from the already-committed projection
 * and the calibration harness, leaving verdict/criteria/scenarios untouched.
 * Running `npm run mc:power` (with data present) produces the same block via
 * the shared lib/amend2-report.mjs helper.
 *
 * No strategy is run. No claim card is frozen. No criterion changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildAmendment2Report } from "./lib/amend2-report.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const p = join(ROOT, "artifacts/map-compass/power-projection.json");
const report = JSON.parse(readFileSync(p, "utf8"));

const before = {
  verdict: report.verdict,
  criteria: JSON.stringify(report.criteria),
  centralCase: JSON.stringify(report.centralCase),
  scenarios: JSON.stringify(report.scenarios),
  grossEdgeNeededR: report.grossEdgeNeededR,
};

const amendment = buildAmendment2Report(report);
Object.assign(report, amendment);

const after = {
  verdict: report.verdict,
  criteria: JSON.stringify(report.criteria),
  centralCase: JSON.stringify(report.centralCase),
  scenarios: JSON.stringify(report.scenarios),
  grossEdgeNeededR: report.grossEdgeNeededR,
};
for (const k of Object.keys(before)) {
  if (before[k] !== after[k]) throw new Error(`criterion changed: ${k}`);
}

writeFileSync(p, JSON.stringify(report, null, 2) + "\n");
const r = report.reportOnly;
console.log(`verdict (unchanged): ${report.verdict}`);
console.log(
  `measured overlap ${r.measuredDependence.overlapFraction}, design effect ${r.measuredDependence.designEffect}, day clusters ${r.measuredDependence.dayClusters}, SE inflation ${r.measuredDependence.seInflation}`,
);
for (const c of r.centralCaseAdjusted)
  console.log(
    `  ${c.state.padEnd(11)} iid p=${c.iidPowerAtFloor} -> clustered/effective p=${c.measuredOverlap.powerAtFloor} (n ${c.projectedTrades} -> ${c.measuredOverlap.nEffective})`,
  );
console.log("criteria hash:", r.criteriaHash);
console.log("report-only: no criterion, threshold, or verdict changed.");
