/**
 * Temporary diagnostic instrumentation — added to trace why ORB, Keltner,
 * PDH, Turtle, and Bollinger Squeeze show zero triggers across a 602-day
 * backtest despite conditions confirmed (by independent testing against
 * real OHLC data) to be loose enough to fire hundreds of times per month.
 *
 * This prints automatically into the on-screen run log at the end of every
 * backtest run — no browser console needed, works the same on phone as on
 * desktop.
 *
 * Reading the result: if a strategy shows 0 total calls, it's not being
 * invoked at all (a registration/wiring bug upstream of this file). If it
 * shows calls but 100% land on one specific fail reason, that reason is the
 * actual bug — look at the "diag:" lines for the live values at the moment
 * it failed (e.g. an ATR or EMA value coming through as undefined).
 *
 * Remove this file and its call sites (the `track(...)` calls in
 * spec-strategies.ts, and the two lines wired into Backtest.tsx) once the
 * root cause is found — this is not meant to ship long-term.
 */

type Counts = Record<string, number>;

const registry: Record<string, Counts> = {};

export function track(strategyId: string, branch: string): void {
  if (!registry[strategyId]) registry[strategyId] = {};
  registry[strategyId][branch] = (registry[strategyId][branch] ?? 0) + 1;
}

/** Returns the report as an array of plain strings, ready to push into any on-screen log. */
export function getDiagnosticsReportLines(): string[] {
  const ids = Object.keys(registry).sort();
  if (ids.length === 0) return [];

  const lines: string[] = ["", "=== DIAGNOSTIC INSTRUMENTATION REPORT ==="];
  for (const id of ids) {
    const counts = registry[id];
    const calledCount = counts["called"] ?? 0;
    lines.push(`\n${id} — ${calledCount} calls total`);
    const sorted = Object.entries(counts)
      .filter(([branch]) => branch !== "called")
      .sort((a, b) => b[1] - a[1]);
    for (const [branch, count] of sorted) {
      const pct = calledCount > 0 ? ((count / calledCount) * 100).toFixed(1) : "0.0";
      lines.push(`  ${count.toString().padStart(6)}  (${pct}%)  ${branch}`);
    }
  }
  lines.push("=== END DIAGNOSTIC REPORT ===", "");
  return lines;
}

export function resetDiagnostics(): void {
  for (const key of Object.keys(registry)) delete registry[key];
}
