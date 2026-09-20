/**
 * Filter F soundness + completeness audit (v1.8 research tooling).
 *
 * Filter F is a *rejection* rule, so it has two failure modes worth auditing
 * separately, and this script re-derives the predicate straight from the raw
 * OHLC instead of importing it — an audit that used the production predicate
 * would only prove the code matches itself:
 *
 *   soundness     every row the engine marked FILTER_F really satisfies the rule
 *                 (no trade is rejected for a reason that is not true)
 *   completeness  every bare-book PASS row that satisfies the rule is rejected in
 *                 the shipped run — by F, or earlier by C / the RR gate
 *                 (no dead weight slips through)
 *
 * It also reports what Filter F removes (per strategy, per side, per session)
 * and the drop-model cost/benefit of those trades, and it re-checks the
 * `enableFilterF: false` opt-out lock against the historical v1.4 golden totals.
 *
 * Run from the repository root:
 *
 *   node --experimental-strip-types --import ./tests/register.mjs scripts/research/audit-filter-f.mjs
 */
import { readFileSync } from "node:fs";
import { runAnalysis } from "../../src/lib/analyzer/run.ts";
import { parseCsv } from "../../src/lib/analyzer/parse.ts";
import { isTradeStrategy } from "../../src/lib/analyzer/strategy-kind.ts";

const MOMENTUM_BODY_MIN = 0.8;
const MOMENTUM_UPPER_WICK_MAX = 0.02;
/**
 * Historical lock for the Filter-C-only book. Re-pinned by v1.8.2: the gap-fill
 * correction changed how a tracked level is resolved when a bar opens beyond it,
 * which re-priced this book from 523.6813503963194 (v1.4) to 507.93925691611344
 * — the number `tests/filter-optout-legacy.test.mjs` pins. Pinning the live
 * value here is the point of the check: it is the cross-check that this script
 * and the certified suite are reading the same book.
 */
const C_ONLY_LOCK = { n: 2323, R: 507.93925691611344 };

const csv = readFileSync(
  new URL("../../artifacts/baseline-xauusd-ohlc.csv", import.meta.url),
  "utf8",
);
const candles = parseCsv(csv).candles;

const run = (opts) => {
  const out = runAnalysis(csv, { seriesEndsComplete: true, ...opts });
  if (!out.ok) throw new Error(out.error);
  return out.analysis;
};

const shipped = run({});
const cOnly = run({ enableFilterF: false });
const bare = run({ enableFilterC: false, enableFilterF: false });

/** Independent re-derivation of the shipped predicate, from raw OHLC only. */
const ruleHolds = (row) => {
  const c = candles[row.index];
  if (!c) return false;
  const range = c.high - c.low;
  if (!(range > 0)) return false;
  const counterTrend =
    (row.side === "long" && row.trend === "bearish") ||
    (row.side === "short" && row.trend === "bullish");
  if (!counterTrend) return false;
  const body = Math.abs(c.close - c.open) / range;
  const upperWick = (c.high - Math.max(c.open, c.close)) / range;
  return body >= MOMENTUM_BODY_MIN && upperWick <= MOMENTUM_UPPER_WICK_MAX;
};

const keyOf = (r) => `${r.strategyId}|${r.datetime}|${r.index}|${r.side ?? ""}`;
const R = (rows) => rows.reduce((s, t) => s + (t.rMultiple ?? 0), 0);

// ---- soundness -------------------------------------------------------------
const filterFRows = shipped.results.filter(
  (r) => r.result === "FAIL" && /^FILTER_F/.test(r.reason),
);
const violations = filterFRows.filter((r) => !ruleHolds(r));
console.log(`FILTER_F rows: ${filterFRows.length} | violating the rule: ${violations.length}`);
for (const v of violations.slice(0, 5)) console.log("  VIOLATION", keyOf(v));

// ---- completeness ----------------------------------------------------------
const shippedByKey = new Map(shipped.results.map((r) => [keyOf(r), r]));
const eligible = [];
const outcomes = {};
for (const r of bare.results) {
  if (r.result !== "PASS" || !isTradeStrategy(r.strategyId)) continue;
  if (!ruleHolds(r)) continue;
  eligible.push(r);
  const d = shippedByKey.get(keyOf(r));
  const tag = !d ? "missing" : d.result === "FAIL" ? d.reason.split(":")[0] : "STILL_PASS";
  outcomes[tag] = (outcomes[tag] ?? 0) + 1;
}
const missed = (outcomes.STILL_PASS ?? 0) + (outcomes.missing ?? 0);
console.log(
  `bare-book candidates satisfying the rule: ${eligible.length} | shipped outcome: ${JSON.stringify(outcomes)} | missed: ${missed}`,
);
const byFOnly = eligible.filter((r) => {
  const d = shippedByKey.get(keyOf(r));
  return d && d.result === "FAIL" && /^FILTER_F/.test(d.reason);
});
console.log(
  `rejected by Filter F only (would have been taken under Filter C alone): ${byFOnly.length}`,
);

// ---- what Filter F removes -------------------------------------------------
const composition = {};
for (const r of filterFRows) composition[r.strategyId] = (composition[r.strategyId] ?? 0) + 1;
console.log(
  `composition: ${Object.entries(composition)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")}`,
);

const sessions = {};
const sides = {};
for (const r of byFOnly) {
  const s = candles[r.index]?.session ?? "?";
  sessions[s] = (sessions[s] ?? 0) + 1;
  const side = (sides[r.side] ??= { n: 0, R: 0, wins: 0 });
  side.n++;
  side.R += r.rMultiple ?? 0;
  if ((r.rMultiple ?? 0) > 0) side.wins++;
}
console.log(`removed by F, by session: ${JSON.stringify(sessions)}`);
for (const [side, s] of Object.entries(sides)) {
  console.log(
    `  removed ${side}: n=${s.n} ownR=${s.R.toFixed(1)} (drop model gain ${(-s.R).toFixed(1)}) WR=${((s.wins / s.n) * 100).toFixed(0)}%`,
  );
}

// ---- opt-out lock ----------------------------------------------------------
const cOnlyTrades = cOnly.results.filter(
  (r) => r.result === "PASS" && isTradeStrategy(r.strategyId),
);
if (cOnlyTrades.length !== C_ONLY_LOCK.n || Math.abs(R(cOnlyTrades) - C_ONLY_LOCK.R) > 1e-9) {
  throw new Error(
    `opt-out drifted: ${cOnlyTrades.length} / ${R(cOnlyTrades)} vs locked ${C_ONLY_LOCK.n} / ${C_ONLY_LOCK.R}`,
  );
}
const shippedTrades = shipped.results.filter(
  (r) => r.result === "PASS" && isTradeStrategy(r.strategyId),
);
console.log(
  `opt-out lock OK (${C_ONLY_LOCK.n} / ${C_ONLY_LOCK.R}) | shipped ${shippedTrades.length} trades / R ${R(shippedTrades).toFixed(6)}`,
);
