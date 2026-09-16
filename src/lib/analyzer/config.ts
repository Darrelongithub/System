/**
 * Analyzer run configuration — the two ways the product runs the engine.
 *
 * The backtest is the laboratory; the live analyzer is the product. For the
 * laboratory to be worth anything, both must run the *same* engine with the
 * *same* rules, differing only in what they are allowed to assume about the end
 * of the series. These two objects are the single source of truth for that
 * difference, so no call site has to re-derive it:
 *
 *   ANALYZER_LIVE_OPTIONS       live page (AnalysisV2): the last row may be a
 *                              candle that is still forming, so it is not
 *                              trusted for signal generation or resolution.
 *   ANALYZER_CERTIFIED_OPTIONS  backtest / golden: the series ends on a closed
 *                              bar, so every row is signal-eligible.
 *
 * NOT pinned here, on purpose: `enableFilterC` / `enableFilterF`. Which filters
 * ship is a *product decision* and it is defined in exactly one place — the
 * `runAnalysis` option defaults in `run.ts`. Keeping it out of this file means a
 * call site cannot quietly run a different rule set, and
 * `tests/analyzer-config-parity.test.mjs` fails if one ever tries to.
 *
 * `enableHtfDirectionFilter` is also inert for trade generation (see the
 * RunOptions doc); it is carried here only because the historical call sites
 * passed it, and `tests/analyzer-htf-inert.test.mjs` pins that.
 */
import type { RunOptions } from "./run";

/** Live analysis: the final row is treated as possibly-in-progress. */
export const ANALYZER_LIVE_OPTIONS: RunOptions = {
  enableHtfDirectionFilter: true,
  seriesEndsComplete: false,
};

/** Certified backtest / golden: every row in the series is a closed candle. */
export const ANALYZER_CERTIFIED_OPTIONS: RunOptions = {
  enableHtfDirectionFilter: true,
  seriesEndsComplete: true,
};
