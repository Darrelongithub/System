/**
 * Warm-up window (calendar days) fetched before the first analysed day so
 * every production strategy's indicators (max: Donchian's 20 completed days)
 * have enough history on day one.
 */
export const STANDARD_LOOKBACK_CALENDAR_DAYS = 30;
