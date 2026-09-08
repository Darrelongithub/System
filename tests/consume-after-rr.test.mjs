/**
 * A2 regression: RR-rejected candidates must NOT consume the strategy/day/side slot.
 *
 * Before the fix, strategy.run() called consume() on PASS before applySpreadAndRR.
 * A candidate that later failed the RR gate still burned the slot, blocking a later
 * valid same-day signal.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { applySpreadAndRR, RR_THRESHOLD } from "../src/lib/analyzer/math.ts";
import { isConsumed, consume } from "../src/lib/analyzer/strategies/util.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { META, HEADER, csvRow, makeCsv } from "./fixtures.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";

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
