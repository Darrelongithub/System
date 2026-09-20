/**
 * Forward validation of the shipped rule set on data it has never seen.
 *
 * This is the *only* sanctioned way to add evidence about a shipped filter after
 * its discovery window. It is deliberately narrow:
 *
 *   - it evaluates the shipped rules as they are; there are no knobs, no
 *     thresholds, no candidate rules, and it cannot "search" for anything;
 *   - it refuses the discovery series and anything overlapping it, so the
 *     discovery baseline cannot be re-mined under a new name;
 *   - it refuses windows shorter than the measured warm-up floor, because a
 *     short window changes the answer (see tests/warmup-window-sufficiency);
 *   - it refuses a series that fails the production series contract (swing refs
 *     that do not resolve, collapsed trend distribution) — validating a rule on
 *     data the product itself would reject measures nothing;
 *   - its verdict follows the criteria pre-registered in FORWARD-VALIDATION.md,
 *     computed mechanically from the numbers below;
 *   - every evaluation is appended to a ledger that records the data hash, the
 *     rule-source hashes and whether the same data was already evaluated, so
 *     "evaluate, peek, re-tune, evaluate again" is visible in the record instead
 *     of being deniable.
 *
 * Usage (from the repository root):
 *
 *   node --experimental-strip-types --import ./tests/register.mjs \
 *     scripts/research/validate-on-new-data.mjs <new-data.csv> [--label="post-2026-08 live window"]
 *
 * The CSV must be in the production generator's format (same header as
 * artifacts/baseline-xauusd-ohlc.csv).
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runAnalysis } from "../../src/lib/analyzer/run.ts";
import { isTradeStrategy } from "../../src/lib/analyzer/strategy-kind.ts";

const WARMUP_FLOOR_BARS = 1000; // tests/warmup-window-sufficiency.test.mjs
const BASELINE = new URL("../../artifacts/baseline-xauusd-ohlc.csv", import.meta.url);
const LEDGER = new URL("../../artifacts/validation/ledger.jsonl", import.meta.url);
/**
 * The rule sources the evaluated ΔR depends on. This must be the same set the
 * golden generator records (`scripts/generate-golden.mjs` → RULE_SOURCES), or
 * the ledger would let two different rule sets look like one hypothesis: exit
 * resolution (`status.ts`) prices every rMultiple in the comparison, and the
 * entry rules + filter order live in the other files, so a change to any of them
 * changes ΔR without touching the two files this used to hash. FORWARD-VALIDATION
 * §2 defines "a shipped rule is identified by the hashes of its sources".
 */
const RULES_SOURCES = [
  "src/lib/analyzer/regime-filters.ts",
  "src/lib/analyzer/run.ts",
  "src/lib/analyzer/strategies/final-survivors.ts",
  "src/lib/analyzer/status.ts",
];

const args = process.argv.slice(2);
const labelArg = args.find((a) => a.startsWith("--label="));
const label = labelArg ? labelArg.slice("--label=".length) : "";
const inputPath = args.find((a) => !a.startsWith("--"));
if (!inputPath) {
  console.error(
    "usage: validate-on-new-data.mjs <new-data.csv> [--label=...]\n" +
      "       (evaluates the shipped rules on data outside the discovery window; no search, no tuning)",
  );
  process.exit(2);
}

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const ruleHashes = Object.fromEntries(
  RULES_SOURCES.map((p) => [
    p.split("/").pop(),
    sha256(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")),
  ]),
);

const csv = readFileSync(inputPath, "utf8");
const baselineCsv = readFileSync(BASELINE, "utf8");
const lines = csv.split("\n");
const dataLines = lines.slice(2).filter((l) => l.trim() !== "");
const baselineLines = baselineCsv
  .split("\n")
  .slice(2)
  .filter((l) => l.trim() !== "");
const dates = (rows) => rows.map((l) => l.slice(0, 10));

// ---- guards ---------------------------------------------------------------
const dataHash = sha256(csv);
if (dataHash === sha256(baselineCsv)) {
  console.error(
    "REFUSED: this is the discovery baseline. Validation data must be data the rule has never seen.",
  );
  process.exit(1);
}
const newDates = dates(dataLines);
const discoveryDates = new Set(dates(baselineLines));
const overlap = [...new Set(newDates.filter((d) => discoveryDates.has(d)))];
if (overlap.length > 0) {
  console.error(
    `REFUSED: ${overlap.length} calendar day(s) in this file are inside the discovery window ` +
      `(${overlap.slice(0, 5).join(", ")}${overlap.length > 5 ? ", …" : ""}).\n` +
      "Out-of-sample means strictly outside the window the rule was selected on. " +
      "Use data after the discovery window ends.",
  );
  process.exit(1);
}
if (dataLines.length < WARMUP_FLOOR_BARS) {
  console.error(
    `REFUSED: ${dataLines.length} bars is below the measured warm-up floor of ${WARMUP_FLOOR_BARS} ` +
      "bars — the newest decisions would not match a full-history run " +
      "(tests/warmup-window-sufficiency.test.mjs). Widen the window.",
  );
  process.exit(1);
}

// ---- evaluation (shipped rules, filter on vs off) --------------------------
const run = (enableFilterF) => {
  const out = runAnalysis(csv, { seriesEndsComplete: true, enableFilterF });
  if (!out.ok) throw new Error(out.error);
  return out;
};
const shippedRun = run(true);
const contract = shippedRun.analysis.contract;
console.log(`series contract: ${contract.ok ? "OK" : "FAILED"}`);
console.log(
  `  bars ${contract.bars} | swing refs ${contract.resolvedRefs}/${contract.swingRefs} resolved ` +
    `(${contract.unresolvedRefShare.toFixed(3)} unresolved) | trend-capable ` +
    `${contract.trendCapableShare.toFixed(3)} | non-ranging ${contract.nonRangingShare.toFixed(3)}`,
);
if (!contract.ok) {
  console.error(
    `REFUSED: the series does not satisfy the production contract:\n  ${contract.failures.join("\n  ")}\n` +
      "The product would refuse this file too; validating a rule on it would measure nothing.",
  );
  process.exit(1);
}

const withF = shippedRun.analysis.results.filter(
  (r) => r.result === "PASS" && isTradeStrategy(r.strategyId),
);
const withoutF = run(false).analysis.results.filter(
  (r) => r.result === "PASS" && isTradeStrategy(r.strategyId),
);
const R = (rows) => rows.reduce((s, t) => s + (t.rMultiple ?? 0), 0);

const monthOf = (r) => r.datetime.slice(0, 7);
const months = [...new Set(withF.concat(withoutF).map(monthOf))].sort();
const perMonth = months.map((m) => {
  const on = withF.filter((r) => monthOf(r) === m);
  const off = withoutF.filter((r) => monthOf(r) === m);
  return {
    month: m,
    on: { n: on.length, R: R(on) },
    off: { n: off.length, R: R(off) },
    deltaR: R(on) - R(off),
  };
});
const sideOf = (s) => (r) => r.side === s;
const perSide = ["long", "short"].map((s) => {
  const on = withF.filter(sideOf(s));
  const off = withoutF.filter(sideOf(s));
  return { side: s, on: { n: on.length, R: R(on) }, deltaR: R(on) - R(off) };
});

const totalOn = { n: withF.length, R: R(withF) };
const totalOff = { n: withoutF.length, R: R(withoutF) };
const deltaR = totalOn.R - totalOff.R;
const losingMonths = perMonth.filter((m) => m.deltaR < 0);
const losingSides = perSide.filter((s) => s.deltaR < 0);

// Pre-registered criteria (FORWARD-VALIDATION.md §3), applied mechanically.
const criteria = [
  { id: "aggregate", pass: deltaR >= 0, detail: `ΔR = ${deltaR.toFixed(2)} must be ≥ 0` },
  {
    id: "months",
    pass: losingMonths.length <= Math.floor(perMonth.length / 2),
    detail: `${losingMonths.length}/${perMonth.length} losing months must be ≤ half`,
  },
  {
    id: "sides",
    pass: losingSides.length <= 1,
    detail: `${losingSides.length}/2 losing sides must be ≤ 1`,
  },
];
const verdict = criteria.every((c) => c.pass) ? "HOLDS" : "FAILS";

// ---- report ---------------------------------------------------------------
console.log(`data: ${inputPath}`);
console.log(`  sha256 ${dataHash}`);
console.log(
  `  ${dataLines.length} bars, ${newDates[0]} → ${newDates[newDates.length - 1]} (no overlap with the discovery window)`,
);
console.log(
  `rules: ${Object.entries(ruleHashes)
    .map(([f, h]) => `${f}@${h.slice(0, 12)}`)
    .join(" ")}`,
);
console.log("");
console.log(`Filter F on : ${totalOn.n} trades / R ${totalOn.R.toFixed(4)}`);
console.log(`Filter F off: ${totalOff.n} trades / R ${totalOff.R.toFixed(4)}`);
console.log(
  `removed ${totalOff.n - totalOn.n} trades, ΔR ${deltaR >= 0 ? "+" : ""}${deltaR.toFixed(4)}`,
);
console.log("");
console.log("per month:");
for (const m of perMonth) {
  console.log(
    `  ${m.month}  on ${String(m.on.n).padStart(4)}/${m.on.R.toFixed(2).padStart(8)}   off ${String(m.off.n).padStart(4)}/${m.off.R.toFixed(2).padStart(8)}   ΔR ${m.deltaR >= 0 ? "+" : ""}${m.deltaR.toFixed(2)}`,
  );
}
console.log("per side:");
for (const s of perSide) {
  console.log(
    `  ${s.side.padEnd(5)} on ${String(s.on.n).padStart(4)}/${s.on.R.toFixed(2).padStart(8)}   ΔR ${s.deltaR >= 0 ? "+" : ""}${s.deltaR.toFixed(2)}`,
  );
}
console.log("");
for (const c of criteria) console.log(`  [${c.pass ? "pass" : "FAIL"}] ${c.id}: ${c.detail}`);
console.log(`\nverdict: ${verdict} (pre-registered criteria, FORWARD-VALIDATION.md §3)`);

// ---- ledger ---------------------------------------------------------------
mkdirSync(new URL("../../artifacts/validation/", import.meta.url), { recursive: true });
let rerun = false;
if (existsSync(LEDGER)) {
  for (const line of readFileSync(LEDGER, "utf8").split("\n")) {
    if (line.trim() && JSON.parse(line).dataSha256 === dataHash) rerun = true;
  }
}
const record = {
  evaluatedAt: new Date().toISOString(),
  label,
  dataPath: inputPath,
  dataSha256: dataHash,
  bars: dataLines.length,
  window: { from: newDates[0], to: newDates[newDates.length - 1] },
  rerun,
  rules: ruleHashes,
  options: { seriesEndsComplete: true, shippedDefaults: true },
  seriesContract: {
    bars: contract.bars,
    unresolvedRefShare: contract.unresolvedRefShare,
    trendCapableShare: contract.trendCapableShare,
    nonRangingShare: contract.nonRangingShare,
    ok: contract.ok,
  },
  gitHead: (() => {
    try {
      return execSync("git rev-parse HEAD").toString().trim();
    } catch {
      return null;
    }
  })(),
  totals: { withF: totalOn, withoutF: totalOff, deltaR, removed: totalOff.n - totalOn.n },
  perMonth,
  perSide,
  criteria,
  verdict,
};
appendFileSync(LEDGER, `${JSON.stringify(record)}\n`);
console.log(
  `ledger: artifacts/validation/ledger.jsonl${rerun ? "  (data hash already evaluated — recorded as a re-run)" : ""}`,
);
if (verdict === "FAILS") {
  console.log(
    "\nA FAILS verdict is evidence, not an instruction: bring it to a product decision.\n" +
      "Do not tune the rule on this data — that would burn the only out-of-sample evidence there is.",
  );
}
