/**
 * Engine-level evaluation of the four frozen forward-validation candidates.
 *
 * The candidates (D_conflict_nearPDL, H1214, Doji+highVol, doji+compressed) ship
 * dormant in `run.ts`. This script is how each one gets judged: it runs the
 * engine twice — baseline (C+F on, candidate off) and candidate on — and reports
 * the whole-book effect, because a rejection frees a de-dupe slot that a later
 * bar may refill. Deleting rows offline would overstate the value (the worked
 * example in `scripts/research/README.md`: offline +16.0 R, engine −3.63 R).
 *
 * One candidate at a time, never stacked — `--candidate=all` means "each on its
 * own baseline", not "all four together".
 *
 * Usage (from the repository root):
 *
 *   node --experimental-strip-types --import ./tests/register.mjs \
 *     scripts/research/evaluate-forward-candidates.mjs <window.csv> [--candidate=all|D|H1214|DojiHighVol|DojiCompressed] [--label="post-2026-08 live window"]
 *
 * The CSV must be in the production generator's format (same header as
 * artifacts/baseline-xauusd-ohlc.csv).
 *
 * What it refuses, exactly like `validate-on-new-data.mjs`:
 *   - a window below the 1,000-bar warm-up floor;
 *   - a series that fails the production series contract.
 * It does NOT refuse the discovery baseline — running the frozen candidates on
 * it is how the discovery numbers in `logs/v1.9-research-filters.md` are
 * reproduced — but it labels every number DISCOVERY there, and
 * FORWARD-VALIDATION.md §1 is explicit that discovery-window results are
 * recurrence only: they cannot promote a candidate and they cannot settle one.
 *
 * Verdicts follow the pre-registered criteria (FORWARD-VALIDATION.md §3):
 * aggregate ΔR ≥ 0, losing months ≤ half the window's months, at most one
 * losing side, and fewer than ~30 rule-relevant trades ⇒ INCONCLUSIVE rather
 * than a pass. Evaluate once per candidate on a given file; the ledger records
 * a re-run so a re-run after peeking is visible.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runAnalysis } from "../../src/lib/analyzer/run.ts";
import { isTradeStrategy } from "../../src/lib/analyzer/strategy-kind.ts";

const WARMUP_FLOOR_BARS = 1000; // tests/warmup-window-sufficiency.test.mjs
const MIN_RULE_RELEVANT_TRADES = 30; // FORWARD-VALIDATION.md §3
const BASELINE = new URL("../../artifacts/baseline-xauusd-ohlc.csv", import.meta.url);
const LEDGER = new URL("../../artifacts/validation/candidate-ledger.jsonl", import.meta.url);
/** Same set the golden generator and validate-on-new-data.mjs record. */
const RULES_SOURCES = [
  "src/lib/analyzer/regime-filters.ts",
  "src/lib/analyzer/run.ts",
  "src/lib/analyzer/strategies/final-survivors.ts",
  "src/lib/analyzer/status.ts",
];

const CANDIDATES = [
  { id: "D", label: "D_conflict_nearPDL", option: "enableFilterD", reasonRe: /^FILTER_D/ },
  { id: "H1214", label: "H1214", option: "enableFilterH1214", reasonRe: /^FILTER_H1214/ },
  {
    id: "DojiHighVol",
    label: "Doji+highVol",
    option: "enableFilterDojiHighVol",
    reasonRe: /^FILTER_DOJI_HIGHVOL/,
  },
  {
    id: "DojiCompressed",
    label: "doji+compressed",
    option: "enableFilterDojiCompressed",
    reasonRe: /^FILTER_DOJI_COMPRESSED/,
  },
];

const args = process.argv.slice(2);
const labelArg = args.find((a) => a.startsWith("--label="));
const label = labelArg ? labelArg.slice("--label=".length) : "";
const candidateArg = args.find((a) => a.startsWith("--candidate="));
const wanted = candidateArg ? candidateArg.slice("--candidate=".length) : "all";
const inputPath = args.find((a) => !a.startsWith("--"));
if (!inputPath) {
  console.error(
    "usage: evaluate-forward-candidates.mjs <window.csv> " +
      "[--candidate=all|D|H1214|DojiHighVol|DojiCompressed] [--label=...]",
  );
  process.exit(2);
}
const selected =
  wanted === "all" ? CANDIDATES : CANDIDATES.filter((c) => c.id === wanted || c.label === wanted);
if (selected.length === 0) {
  console.error(
    `unknown candidate: ${wanted}\n  known: ${CANDIDATES.map((c) => c.id).join(", ")} (or "all")`,
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
const dataHash = sha256(csv);
const isDiscoveryBaseline = dataHash === sha256(readFileSync(BASELINE, "utf8"));
const lines = csv.split("\n");
const dataLines = lines.slice(2).filter((l) => l.trim() !== "");
const dates = dataLines.map((l) => l.slice(0, 10));

// ---- guards ---------------------------------------------------------------
if (dataLines.length < WARMUP_FLOOR_BARS) {
  console.error(
    `REFUSED: ${dataLines.length} bars is below the measured warm-up floor of ${WARMUP_FLOOR_BARS} ` +
      "bars — the newest decisions would not match a full-history run " +
      "(tests/warmup-window-sufficiency.test.mjs). Widen the window.",
  );
  process.exit(1);
}

const run = (options) => {
  const out = runAnalysis(csv, { seriesEndsComplete: true, ...options });
  if (!out.ok) throw new Error(out.error);
  return out.analysis;
};

const tradeRows = (analysis) =>
  analysis.results.filter((r) => r.result === "PASS" && isTradeStrategy(r.strategyId));
const R = (rows) => rows.reduce((s, t) => s + (t.rMultiple ?? 0), 0);
const keyOf = (r) => `${r.strategyId}|${r.datetime}|${r.index}|${r.side ?? "-"}`;
const monthOf = (r) => r.datetime.slice(0, 7);
const fmt = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

// The baseline run doubles as the contract gate: validating a candidate on data
// the product itself would refuse measures nothing.
const baseline = run({});
const contract = baseline.contract;
console.log(`series contract: ${contract.ok ? "OK" : "FAILED"}`);
console.log(
  `  bars ${contract.bars} | swing refs ${contract.resolvedRefs}/${contract.swingRefs} resolved ` +
    `(${contract.unresolvedRefShare.toFixed(3)} unresolved) | trend-capable ` +
    `${contract.trendCapableShare.toFixed(3)} | non-ranging ${contract.nonRangingShare.toFixed(3)}`,
);
if (!contract.ok) {
  console.error(
    `REFUSED: the series does not satisfy the production contract:\n  ${contract.failures.join("\n  ")}\n` +
      "The product would refuse this file too.",
  );
  process.exit(1);
}

const window = { from: dates[0], to: dates[dates.length - 1], bars: dataLines.length };
console.log(`data: ${inputPath}`);
console.log(`  sha256 ${dataHash}`);
console.log(`  ${window.bars} bars, ${window.from} → ${window.to}`);
console.log(
  `rules: ${Object.entries(ruleHashes)
    .map(([f, h]) => `${f}@${h.slice(0, 12)}`)
    .join(" ")}`,
);
console.log(
  `baseline: ${baseline.tradePasses.length} trades / R ${R(baseline.tradePasses).toFixed(4)} (C+F on, candidates off)`,
);
if (isDiscoveryBaseline) {
  console.log(
    "\n*** DISCOVERY WINDOW — every number below is in-sample. ***\n" +
      "Per FORWARD-VALIDATION.md §1 a discovery-window result is recurrence only:\n" +
      "it cannot promote a candidate and it cannot settle one. Evidence about a\n" +
      "candidate comes from data that did not exist when it was chosen.",
  );
}

const records = [];
for (const candidate of selected) {
  const on = run({ [candidate.option]: true });
  const off = tradeRows(baseline);
  const onTrades = tradeRows(on);
  const rejected = on.results.filter((r) => candidate.reasonRe.test(r.reason));
  const rejectedKeys = new Set(rejected.map(keyOf));
  const removed = off.filter((r) => rejectedKeys.has(keyOf(r)));
  const removedR = R(removed);
  const offKeys = new Set(off.map(keyOf));
  const refills = onTrades.filter((r) => !offKeys.has(keyOf(r)));

  const months = [...new Set([...off, ...onTrades].map(monthOf))].sort();
  const perMonth = months.map((m) => {
    const onM = onTrades.filter((r) => monthOf(r) === m);
    const offM = off.filter((r) => monthOf(r) === m);
    return {
      month: m,
      on: { n: onM.length, R: R(onM) },
      off: { n: offM.length, R: R(offM) },
      deltaR: R(onM) - R(offM),
    };
  });
  const perSide = ["long", "short"].map((s) => {
    const onS = onTrades.filter((r) => r.side === s);
    const offS = off.filter((r) => r.side === s);
    return {
      side: s,
      on: { n: onS.length, R: R(onS) },
      off: { n: offS.length, R: R(offS) },
      deltaR: R(onS) - R(offS),
    };
  });
  const perStrategy = [...new Set([...off, ...onTrades].map((r) => r.strategyId))]
    .sort()
    .map((id) => {
      const onS = onTrades.filter((r) => r.strategyId === id);
      const offS = off.filter((r) => r.strategyId === id);
      return {
        strategyId: id,
        on: { n: onS.length, R: R(onS) },
        off: { n: offS.length, R: R(offS) },
        deltaR: R(onS) - R(offS),
      };
    });

  const deltaR = R(onTrades) - R(off);
  const losingMonths = perMonth.filter((m) => m.deltaR < 0);
  const losingSides = perSide.filter((s) => s.deltaR < 0);

  // Pre-registered criteria (FORWARD-VALIDATION.md §3), applied mechanically.
  const inconclusive = removed.length < MIN_RULE_RELEVANT_TRADES;
  const criteria = [
    { id: "aggregate", pass: deltaR >= 0, detail: `ΔR ${fmt(deltaR)} must be ≥ 0` },
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
    {
      id: "sample",
      pass: !inconclusive,
      detail: `${removed.length} rule-relevant trades must be ≥ ${MIN_RULE_RELEVANT_TRADES}`,
    },
  ];
  const verdict = inconclusive
    ? "INCONCLUSIVE"
    : criteria.slice(0, 3).every((c) => c.pass)
      ? "HOLDS"
      : "FAILS";

  console.log(`\n=== ${candidate.id} — ${candidate.label} ===`);
  console.log(
    `  off ${String(off.length).padStart(4)} trades / R ${R(off).toFixed(4)}   ` +
      `on ${String(onTrades.length).padStart(4)} trades / R ${R(onTrades).toFixed(4)}`,
  );
  console.log(
    `  rejected ${rejected.length} candidates | removed ${removed.length} trades (own R ${removedR.toFixed(2)}) | ` +
      `refilled ${refills.length} | engine ΔR ${fmt(deltaR)}`,
  );
  console.log("  per month:");
  for (const m of perMonth) {
    console.log(
      `    ${m.month}  on ${String(m.on.n).padStart(4)}/${m.on.R.toFixed(2).padStart(8)}   ` +
        `off ${String(m.off.n).padStart(4)}/${m.off.R.toFixed(2).padStart(8)}   ΔR ${fmt(m.deltaR)}`,
    );
  }
  console.log("  per side:");
  for (const s of perSide) {
    console.log(
      `    ${s.side.padEnd(5)} on ${String(s.on.n).padStart(4)}/${s.on.R.toFixed(2).padStart(8)}   ΔR ${fmt(s.deltaR)}`,
    );
  }
  console.log("  per strategy (only strategies the candidate touches):");
  for (const s of perStrategy) {
    if (s.deltaR === 0 && s.on.n === s.off.n) continue;
    console.log(
      `    ${s.strategyId.padEnd(16)} on ${String(s.on.n).padStart(4)}/${s.on.R.toFixed(2).padStart(8)}   ` +
        `off ${String(s.off.n).padStart(4)}/${s.off.R.toFixed(2).padStart(8)}   ΔR ${fmt(s.deltaR)}`,
    );
  }
  for (const c of criteria) console.log(`    [${c.pass ? "pass" : "FAIL"}] ${c.id}: ${c.detail}`);
  console.log(
    `  verdict: ${verdict}${isDiscoveryBaseline ? "  (DISCOVERY window — recurrence only)" : ""}`,
  );

  records.push({
    evaluatedAt: new Date().toISOString(),
    label,
    candidate: candidate.id,
    candidateLabel: candidate.label,
    option: candidate.option,
    dataPath: inputPath,
    dataSha256: dataHash,
    window,
    windowKind: isDiscoveryBaseline ? "discovery" : "oos",
    rules: ruleHashes,
    options: { seriesEndsComplete: true, filterC: true, filterF: true, [candidate.option]: true },
    gitHead: (() => {
      try {
        return execSync("git rev-parse HEAD").toString().trim();
      } catch {
        return null;
      }
    })(),
    totals: {
      off: { n: off.length, R: R(off) },
      on: { n: onTrades.length, R: R(onTrades) },
      deltaR,
      rejected: rejected.length,
      removed: removed.length,
      removedR,
      refills: refills.length,
    },
    perMonth,
    perSide,
    perStrategy,
    criteria,
    verdict,
  });
}

// ---- ledger ---------------------------------------------------------------
mkdirSync(new URL("../../artifacts/validation/", import.meta.url), { recursive: true });
let rerun = false;
if (existsSync(LEDGER)) {
  for (const line of readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (
      record.dataSha256 === dataHash &&
      selected.some((c) => c.id === record.candidate) &&
      record.rules &&
      RULES_SOURCES.every(
        (p) => record.rules[p.split("/").pop()] === ruleHashes[p.split("/").pop()],
      )
    ) {
      rerun = true;
    }
  }
}
for (const record of records) appendFileSync(LEDGER, `${JSON.stringify({ ...record, rerun })}\n`);
console.log(
  `\nledger: artifacts/validation/candidate-ledger.jsonl${rerun ? "  (an identical evaluation is already recorded — marked as a re-run)" : ""}`,
);
console.log(
  "A candidate is promoted by a HOLDS verdict on out-of-sample data — never by a number here.\n" +
    "A FAILS verdict obliges a product decision: turn it off, narrow its scope only if that\n" +
    "scope was pre-registered, or accept it knowingly with the reason written down.",
);
