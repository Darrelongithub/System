/**
 * Trend-input causality — `candle.trend` is not computed from the price series
 * by the analyzer: it is derived from the `similar_swing_refs` column produced
 * by the data generator (`src/lib/ohlc-generator.ts`), which marks a swing point
 * with SWING_LOOKBACK (= 3) candles on **each** side. Both shipped filters
 * (C and F) and every trend-aware strategy read that field, so a reference that
 * could only have been confirmed *after* its decision bar would put hindsight
 * straight into the live decision.
 *
 * A pivot at bar j is confirmed once its right window has closed, i.e. at bar
 * j + SWING_LOOKBACK. So a reference used by a decision at bar i is causally
 * sound iff i - j >= SWING_LOOKBACK. The engine's own guard is *weaker* than
 * that (`match.index < candle.index`: anything strictly earlier is accepted), so
 * the guarantee lives in the generator's ref-assignment rule — which is why it
 * is pinned here, on the data, rather than only in the resolver.
 *
 * Measured on the locked baseline: 44,652 refs, 0 forward-pointing, 0
 * self-referencing, minimum separation 4 bars (the generator emits none closer
 * than 4, one bar inside the 3-bar confirmation requirement). 3,039 refs point
 * to rows older than the file starts; they are dropped (fail-closed), which
 * costs trend information but can never add hindsight.
 *
 * These tests pin that property on the locked baseline and pin the engine's
 * fail-closed handling of hostile references, so a generator change (a shorter
 * right window, a new ref-assignment rule) cannot silently move hindsight into
 * the trend field.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import {
  buildIndex,
  computeMarketStructure,
  resolveSwings,
} from "../src/lib/analyzer/structure.ts";

/** The generator confirms a swing with this many candles on each side. */
const SWING_LOOKBACK = 3;

test("trend input: every swing reference in the locked baseline was confirmable at its decision bar", () => {
  const candles = parseCsv(loadBaselineCsv()).candles;
  const indexOf = new Map(candles.map((c) => [c.datetime.trim(), c.index]));

  let refs = 0;
  let forward = 0;
  let self = 0;
  let unconfirmed = 0;
  let outOfFile = 0;
  let minSeparation = Number.POSITIVE_INFINITY;

  for (const candle of candles) {
    for (const ref of candle.similarSwingRefs) {
      refs += 1;
      const j = indexOf.get(ref.trim());
      if (j === undefined) {
        outOfFile += 1;
        continue;
      }
      if (j > candle.index) forward += 1;
      else if (j === candle.index) self += 1;
      else {
        minSeparation = Math.min(minSeparation, candle.index - j);
        // A pivot at j is confirmable at bar j + SWING_LOOKBACK; a decision at
        // bar i may use it only from that bar on.
        if (candle.index - j < SWING_LOOKBACK) unconfirmed += 1;
      }
    }
  }

  assert(refs > 40_000, `expected the baseline to carry swing refs, saw ${refs}`);
  assertEqual(forward, 0, "forward-pointing refs (hindsight in the trend field)");
  assertEqual(self, 0, "self-referencing refs");
  assertEqual(
    unconfirmed,
    0,
    "refs whose swing could not have been confirmed before the decision bar",
  );
  assert(
    minSeparation >= SWING_LOOKBACK,
    `minimum ref separation ${minSeparation} must be at least SWING_LOOKBACK (${SWING_LOOKBACK})`,
  );
  assert(
    outOfFile > 0,
    "refs older than the file are expected and must be dropped, not resolvable",
  );
});

test("trend input: future and self references are dropped fail-closed, never used as swings", () => {
  const candles = parseCsv(loadBaselineCsv()).candles;
  const byDatetime = buildIndex(candles);
  const target = candles[200];
  const future = candles[201].datetime;
  const past = candles[10].datetime;
  const malicious = {
    ...target,
    similarSwingRefs: [future, target.datetime, past],
  };
  const swings = resolveSwings(malicious, byDatetime);
  assertEqual(swings.unresolved.length, 2, "future + self refs must be reported unresolved");
  assertEqual(swings.candles.length, 1, "only the strictly-earlier ref may shape the trend");
  assertEqual(swings.candles[0].datetime, past, "the surviving ref is the earlier one");
});

test("trend input: refs that fail to resolve collapse the trend to ranging (never to a guess)", () => {
  const candles = parseCsv(loadBaselineCsv()).candles;
  const byDatetime = buildIndex(candles);
  const target = candles[500];
  const stripped = { ...target, similarSwingRefs: [] };
  const swings = resolveSwings(stripped, byDatetime);
  assertEqual(swings.candles.length, 0, "no refs ⇒ no swings");
  assertEqual(swings.highs.length, 0, "no highs");
  assertEqual(swings.lows.length, 0, "no lows");

  // Same result the engine stores: structure with no usable refs is "ranging",
  // which every consumer must treat as "no trend information", not as a signal.
  const local = [{ ...stripped }];
  computeMarketStructure(local, byDatetime);
  assertEqual(local[0].trend, "ranging", "unresolved refs must not fabricate a trend");
});
