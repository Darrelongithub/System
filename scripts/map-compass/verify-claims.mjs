#!/usr/bin/env node
/**
 * M5 — claim verification harness (the heavy-testing engine).
 *
 * SAFETY GATE: refuses to run real verification until the claim cards are
 * FROZEN (decision #13). `--dry-run` exercises the whole harness on synthetic
 * placebo data and writes a calibration report but NO ledger records.
 *
 * Usage:
 *   node scripts/map-compass/verify-claims.mjs --dry-run
 *   node scripts/map-compass/verify-claims.mjs              # requires FROZEN cards
 *
 * This script does NOT invent strategy signals. It consumes a book-level
 * trades JSONL produced by the (future) M6 strategy library + lib/trade.mjs.
 * Each record: { strategyId, state, year, netR, side }.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { FREEZE, CLAIM_CARDS, validateClaimCards } from "./claim-cards.draft.mjs";
import { assertCardsFrozen, ledgerPath, readLedger, appendVerdict } from "./lib/claim-ledger.mjs";
import {
  verifyClaim,
  groupByFamilyState,
  groupByStrategyState,
  mde,
  powerAt,
} from "./lib/verification.mjs";
import { placeboDistribution, mulberry32 } from "./lib/placebo.mjs";
import { ROLES, CLAIM_CRITERIA, STATES, SENSITIVITY_RULE, EVIDENCE } from "./frozen.mjs";
import { TEST_ORDER } from "./claim-cards.draft.mjs";

/** True only when executed as a script, not when imported by tests. */
export const IS_MAIN =
  !!process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("verify-claims.mjs");

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "artifacts/map-compass");
const familyOf = new Map(CLAIM_CARDS.map((c) => [c.id, c.family]));

/**
 * The battery: for every card, verify its strength and weakness claim at FAMILY
 * level (pooled variants), and also record a strategy-level drill-down that
 * defaults to INCONCLUSIVE. Returns an array of verdict rows.
 */
export function runBattery(
  trades,
  { windowKind = "DEV", baseline = null, sensitivityAgreementPct = 100 } = {},
) {
  const familyCells = groupByFamilyState(trades, familyOf);
  const strategyCells = groupByStrategyState(trades);
  const rows = [];
  for (const c of CLAIM_CARDS) {
    for (const [kind, half] of [
      ["strength", c.strength],
      ["weakness", c.weakness],
    ]) {
      const key = `${c.family}|${half.state}`;
      const pooled = familyCells.get(key) ?? [];
      const own = strategyCells.get(`${c.id}|${half.state}`) ?? [];
      // Pooled (family) is the verdict; strategy-level is diagnostic only.
      const stats = verifyClaim(pooled, {
        direction: half.direction,
        sensitivityAgreementPct,
        baseline,
      });
      const diagnostic = verifyClaim(own, {
        direction: half.direction,
        sensitivityAgreementPct,
        baseline,
      });
      rows.push({
        claimId: c.id,
        family: c.family,
        state: half.state,
        kind,
        windowKind,
        verdict: stats.verdict,
        stats,
        strategyLevel: {
          n: diagnostic.n,
          meanNetR: diagnostic.meanNetR,
          t: diagnostic.t,
          verdict: diagnostic.verdict,
        },
        priority: c.priority,
        evidenceTier: c.evidenceTier,
        conditional: stats.conditional,
        stability: stats.stability,
      });
    }
  }
  // FIXED-SEQUENCE order: tier ascending, then frozen priority. Every row
  // carries its testOrder so the ledger preserves the pre-registered sequence.
  const order = new Map(TEST_ORDER.map((t) => [t.id, t.testOrder]));
  rows.sort(
    (a, b) =>
      (order.get(a.claimId) ?? 999) - (order.get(b.claimId) ?? 999) ||
      (a.kind === "strength" ? -1 : 1),
  );
  for (let i = 0; i < rows.length; i++) rows[i].testOrder = i + 1;
  return rows;
}

/** Deterministic synthetic trades for calibration. Known injected edge. */
export function syntheticTrades({ seed = 7, perCell = 900, trueEdgeR = 0, sd = 1.43 } = {}) {
  const rng = mulberry32(seed);
  const trades = [];
  const years = ROLES.DEV;
  for (const c of CLAIM_CARDS) {
    for (const half of [c.strength, c.weakness]) {
      for (let i = 0; i < perCell; i++) {
        // Box-Muller normal, plus the injected edge (signed by claim direction).
        const u = Math.max(1e-9, rng());
        const v = rng();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        const year = years[Math.floor(rng() * years.length)];
        // G0 Amendment 2: give every synthetic trade a calendar day (for
        // cluster-robust SEs) and an entry bar. Variants in the SAME family
        // draw from a shared per-state/year bar pool, so their entry bars
        // overlap — that is the effective-sample effect the harness must
        // measure rather than assume away.
        const month = 1 + Math.floor(rng() * 12);
        const dayOfMonth = 1 + Math.floor(rng() * 28);
        const bar = Math.floor(rng() * perCell);
        trades.push({
          strategyId: c.id,
          family: c.family,
          state: half.state,
          year,
          day: `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`,
          entryBar: `${c.family}|${half.state}|${year}|${bar}`,
          netR: z * sd + trueEdgeR * half.direction,
          side: rng() > 0.5 ? "long" : "short",
        });
      }
    }
  }
  return trades;
}

/** Load the frozen random-entry baseline if present. */
export function loadBaseline() {
  const p = join(OUT, "random-baseline.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function powerTable() {
  const out = [];
  for (const n of [100, 200, 300, 500, 750, 1000, 1600, 2400]) {
    out.push({
      n,
      mdeR: +mde(n, 1.43).toFixed(4),
      powerAt010R: +powerAt(n, 1.43, 0.1).toFixed(3),
      powerAt015R: +powerAt(n, 1.43, 0.15).toFixed(3),
    });
  }
  return out;
}

/** Dry-run calibration. Returns the report (also written by main). */
export function calibrate() {
  const cardErrors = validateClaimCards();
  if (cardErrors.length) throw new Error(`claim card errors: ${cardErrors.join("; ")}`);

  const report = {
    generatedAt: new Date().toISOString(),
    cardsFrozen: FREEZE.status === "FROZEN",
    cardStatus: FREEZE.status,
    mode: "DRY_RUN_CALIBRATION",
    criteria: CLAIM_CRITERIA,
    states: STATES,
    devYears: ROLES.DEV,
    powerTable: powerTable(),
    calibration: null,
    placebo: null,
    real: null,
    baselineLoaded: !!loadBaseline(),
    sensitivityRule: SENSITIVITY_RULE,
    evidence: EVIDENCE,
    testOrder: TEST_ORDER.map((t) => ({ id: t.id, tier: t.tier, testOrder: t.testOrder })),
  };

  // Calibration A: zero true edge -> false-positive rate of the battery.
  let fp = 0;
  const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
  for (const s of seeds) {
    const trades = syntheticTrades({ seed: s, perCell: 600, trueEdgeR: 0 });
    fp += runBattery(trades).filter((r) => r.verdict === "CONFIRMED").length;
  }
  // Calibration B: known edge -> detection rate.
  const knownRows = runBattery(syntheticTrades({ seed: 101, perCell: 600, trueEdgeR: 0.15 }));
  const detected = knownRows.filter((r) => r.verdict === "CONFIRMED").length;
  // Calibration C: placebo false-discovery floor.
  const placebo = placeboDistribution(
    syntheticTrades({ seed: 999, perCell: 400, trueEdgeR: 0 }),
    (t) => runBattery(t),
    { shuffles: 40, seed: 20261026 },
  );

  report.calibration = {
    seeds: seeds.length,
    totalClaimsPerRun: CLAIM_CARDS.length * 2,
    falsePositiveConfirms: fp,
    falsePositiveRate: +(fp / (seeds.length * CLAIM_CARDS.length * 2)).toFixed(4),
    knownEdgeR: 0.15,
    knownEdgeDetected: detected,
    knownEdgeDetectionRate: +(detected / (CLAIM_CARDS.length * 2)).toFixed(4),
  };
  report.placebo = placebo;
  report.note =
    "DRY RUN: synthetic trades only. No ledger records written. This calibrates the harness (kill criterion #7).";
  return report;
}

/** Real verification. Requires frozen cards AND a trades JSONL. */
export function verifyReal(tradesPath) {
  assertCardsFrozen(FREEZE); // hard gate — decision #13
  if (!existsSync(tradesPath)) {
    throw new Error(`no trades file at ${tradesPath}. M6 strategy library must produce it.`);
  }
  const trades = readFileSync(tradesPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const rows = runBattery(trades);
  const ledger = ledgerPath(ROOT);
  for (const r of rows) {
    appendVerdict(ledger, {
      claimId: r.claimId,
      family: r.family,
      state: r.state,
      kind: r.kind,
      windowKind: r.windowKind,
      verdict: r.verdict,
      stats: r.stats,
      strategyLevel: r.strategyLevel,
    });
  }
  return {
    rows,
    summary: {
      trades: trades.length,
      rows: rows.length,
      confirmed: rows.filter((r) => r.verdict === "CONFIRMED").length,
      refuted: rows.filter((r) => r.verdict === "REFUTED").length,
      inconclusive: rows.filter((r) => r.verdict === "INCONCLUSIVE").length,
      ledgerRecords: readLedger(ledger).length,
    },
  };
}

if (IS_MAIN) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
  );
  if (args["dry-run"]) {
    const report = calibrate();
    writeFileSync(join(OUT, "harness-calibration.json"), JSON.stringify(report, null, 2) + "\n");
    const p = (n) => report.powerTable.find((x) => x.n === n).powerAt010R;
    console.log(
      `dry-run calibration: FP rate ${report.calibration.falsePositiveRate}, known-edge detection ${report.calibration.knownEdgeDetectionRate}`,
    );
    console.log(
      `placebo: median ${report.placebo.medianFakeConfirms} fake confirms, p95 ${report.placebo.p95FakeConfirms}`,
    );
    console.log(`power@+0.10R: n=1000 -> ${p(1000)}, n=1600 -> ${p(1600)}`);
    process.exit(0);
  }
  const tradesPath = args.trades
    ? String(args.trades)
    : join(ROOT, "artifacts/map-compass/claimed-trades.jsonl");
  try {
    const { rows, summary } = verifyReal(tradesPath);
    writeFileSync(
      join(OUT, "claim-verification.json"),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), cardsFrozen: true, summary, rows },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `verified ${rows.length} claims: ${summary.confirmed} CONFIRMED, ${summary.refuted} REFUTED, ${summary.inconclusive} INCONCLUSIVE`,
    );
  } catch (e) {
    console.error(`BLOCKED: ${e.message}`);
    console.error("Run with --dry-run to calibrate the harness on synthetic data instead.");
    process.exit(2);
  }
}
