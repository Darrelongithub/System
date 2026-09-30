/**
 * Warm-up policy shared by every path that turns a calendar range into an
 * analysable series.
 *
 * The analyzer refuses to make decisions from a series shorter than
 * `MIN_PRODUCTION_BARS` (`src/lib/analyzer/series-contract.ts`): below that
 * depth the warm-up is not saturated and the newest bar's rows differ from a
 * full-history run. Any caller that fetches "the range the user asked for plus
 * a bit of history" therefore has one job — fetch enough history that the
 * production floor is actually cleared. That number is derived here, in one
 * place, so the fetch policy and the gate it has to satisfy can never drift
 * apart again (they used to: a fixed 30-day warm-up sat right on top of a
 * 1000-bar floor — 17% of the baseline's 31-day windows carried fewer than
 * 1000 bars, and 1 in 12 single-day backtests was rejected outright before a
 * single trade was priced).
 */
import { MIN_PRODUCTION_BARS } from "@/lib/analyzer/config";

/** 30-minute candles in a full 24-hour forex/metals session. */
export const BARS_PER_SESSION_DAY = 48;

/** A 24/5 market trades 5 days out of every 7 calendar days. */
const CALENDAR_DAYS_PER_TRADING_DAY = 7 / 5;

/**
 * Margin for full-market closures (weekly closures are already in the 7/5
 * ratio; this covers exchange holidays and the export's trimming of the
 * weekly closure rows).
 *
 * Calibrated on the locked baseline: the worst 47-calendar-day window in
 * `artifacts/baseline-xauusd-ohlc.csv` carries 1,290 bars, 29% above the
 * floor, and the worst 38-day window only 1,002 (0.2%). Anything below ~40
 * days leaves ordinary holiday stretches under the floor.
 */
const CLOSURE_MARGIN = 1.55;

/**
 * Calendar days of history fetched before the first analysed day so every
 * production strategy's indicators (max: Donchian's 20 completed days) have
 * enough history on day one — and so the series clears the production bar
 * floor on a short range.
 *
 * Turtle (55-day S2) is not part of the production set, so its wider
 * 120-day window is deliberately not fetched here.
 */
export const STANDARD_LOOKBACK_CALENDAR_DAYS = Math.ceil(
  (MIN_PRODUCTION_BARS / BARS_PER_SESSION_DAY) * CALENDAR_DAYS_PER_TRADING_DAY * CLOSURE_MARGIN,
);
