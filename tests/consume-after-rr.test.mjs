/**
 * A2 regression: RR-rejected candidates must NOT consume the strategy/day/side slot.
 *
 * Before the fix, strategy.run() called consume() on PASS before applySpreadAndRR.
 * A candidate that later failed the RR gate still burned the slot, blocking a later
 * valid same-day signal. Filters C and F sit in the same gate chain, so a
 * C/F-rejected candidate must not hold the slot either.
 *
 * Mutation check (2026-09-17 bug-hunt): moving `consume()` back to the top of the
 * PASS branch — i.e. reintroducing the pre-fix behaviour — left the first three
 * tests in this file green (they only exercise the helper and check for duplicate
 * keys, both of which hold in the broken book). The locked baseline contains 74
 * trades that exist only because the slot was released, so the last test below
 * pins that property directly: it fails (count 0) with the bug present.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { applySpreadAndRR, RR_FAIL_REASON, RR_THRESHOLD } from "../src/lib/analyzer/math.ts";
import { isConsumed, consume } from "../src/lib/analyzer/strategies/util.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { META, HEADER, csvRow, makeCsv } from "./fixtures.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";
import { FILTER_C_REASON, FILTER_F_REASON } from "../src/lib/analyzer/regime-filters.ts";

test("A2 unit: applySpreadAndRR rejects tiny-risk long so RR <= threshold", () => {
  // Mirrors dual-thrust geometry: SL = close - 1.5*atr, TP = close + 2.5*(1.5*atr)
  const close = 2000;
  const atr = 0.15;
  const sl = close - 1.5 * atr;
  const risk = close - sl;
  const tp = close + 2.5 * risk;
  const math = applySpreadAndRR(
    { result: "PASS", reason: "t", entry: close, sl, tp, side: "long", orderType: "market" },
    0.2,
  );
  assert(math, "math defined");
  assert(math.rr !== undefined, "rr defined");
  assert(math.rr <= RR_THRESHOLD, `expected RR<=${RR_THRESHOLD}, got ${math.rr}`);
});

test("A2 unit: consume is only committed when caller decides (slot free until consume)", () => {
  const ctx = { consumed: new Map() };
  const key = "2025-01-10:L";
  assert(!isConsumed(ctx, "dual-thrust", key), "slot starts free");
  // Proposed key without commit — still free
  assert(!isConsumed(ctx, "dual-thrust", key), "uncommitted proposal leaves slot free");
  consume(ctx, "dual-thrust", key);
  assert(isConsumed(ctx, "dual-thrust", key), "slot occupied after explicit consume");
});

test("A2 integration: baseline still produces finite PASS set with no duplicate day/side", () => {
  const result = runAnalysis(loadBaselineCsv(), {
    seriesEndsComplete: true,
    enableHtfDirectionFilter: true,
  });
  assert(result.ok, "baseline parses");
  const passes = result.analysis.tradePasses;
  assert(passes.length > 0, "has passes");
  const keys = new Map();
  for (const t of passes) {
    const day = t.datetime.slice(0, 10);
    const k = `${t.strategyId}|${day}|${t.side}`;
    keys.set(k, (keys.get(k) || 0) + 1);
  }
  const dups = [...keys.entries()].filter(([, n]) => n > 1);
  assertEqual(dups.length, 0, "no duplicate strategy/day/side after A2 fix");
});

test("A2 documentation: enableHtfDirectionFilter remains a no-op (A1 not activated)", () => {
  const csv = loadBaselineCsv();
  const a = runAnalysis(csv, { seriesEndsComplete: true, enableHtfDirectionFilter: true });
  const b = runAnalysis(csv, { seriesEndsComplete: true, enableHtfDirectionFilter: false });
  assert(a.ok && b.ok, "both ok");
  assertEqual(
    a.analysis.tradePasses.length,
    b.analysis.tradePasses.length,
    "A1 still inert: flag must not change trigger count in this phase",
  );
});

/**
 * The behaviour test. A trade carries a (strategy, day, side) slot key, so if an
 * EARLIER same-day candidate for that key was rejected by one of the gates that
 * sit between the PASS result and `consume()` (spread/RR, Filter C, Filter F),
 * the later trade can only exist because the rejected candidate released the
 * slot. Counting those trades is therefore a direct measurement of the fix, and
 * it collapses to zero if `consume()` moves back above the gates.
 *
 * pdh-retest is excluded: its key is the PREVIOUS session day, so key identity
 * cannot be derived from the signal row's own date.
 */
const GATE_REJECT_REASONS = new Set([
  RR_FAIL_REASON,
  FILTER_C_REASON,
  FILTER_F_REASON,
  "invalid canonical entry/SL/TP price set",
  "INVALID: RR not computable",
]);
const isGateReject = (reason) => GATE_REJECT_REASONS.has(reason) || /^INVALID:/.test(reason ?? "");

test("A2 behaviour: the shipped book contains trades that only exist because a gate-rejected candidate released the slot", () => {
  const result = runAnalysis(loadBaselineCsv(), ANALYZER_CERTIFIED_OPTIONS);
  assert(result.ok, "certified baseline run must succeed");
  const analysis = result.analysis;

  let slotReleased = 0;
  const perStrategy = new Map();
  let example = null;
  for (const trade of analysis.tradePasses) {
    if (trade.strategyId === "pdh-retest") continue; // key is the prior session day
    const day = trade.datetime.slice(0, 10);
    const blocker = analysis.results.find(
      (row) =>
        row.strategyId === trade.strategyId &&
        row.side === trade.side &&
        row.result === "FAIL" &&
        row.datetime.slice(0, 10) === day &&
        row.datetime < trade.datetime &&
        isGateReject(row.reason),
    );
    if (!blocker) continue;
    slotReleased += 1;
    perStrategy.set(trade.strategyId, (perStrategy.get(trade.strategyId) ?? 0) + 1);
    example ??= `${trade.strategyId} ${trade.datetime} ${trade.side} survived gate rejection at ${blocker.datetime} (${blocker.reason.slice(0, 24)}…)`;
  }

  assert(
    slotReleased > 0,
    `no trade in the shipped book depends on a released slot — either the gate chain ` +
      `stopped releasing it (the A2 bug) or the baseline changed. First candidate: ${example}`,
  );
  assertEqual(
    slotReleased,
    70,
    `gate-released trades in the shipped book (mutation-verified: 0 when consume() precedes the gates)\n  ` +
      [...perStrategy].map(([id, n]) => `${id} ${n}`).join(", "),
  );
  assertEqual(perStrategy.size, 8, "eight day-keyed strategies are affected");
});
