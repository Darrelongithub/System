/**
 * Shared baseline fixture: the locked XAUUSD golden input, parsed and
 * analysed lazily exactly once per test process.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("..", import.meta.url));

export function repoPath(p) {
  return new URL(`../${p}`, import.meta.url);
}

let cached = undefined;

export function loadBaselineCsv() {
  return readFileSync(new URL("../artifacts/baseline-xauusd-ohlc.csv", import.meta.url), "utf8");
}

export function loadGoldenTrades() {
  return JSON.parse(readFileSync(new URL("../artifacts/golden-trades.json", import.meta.url), "utf8"));
}

export function loadGoldenSummary() {
  return JSON.parse(readFileSync(new URL("../artifacts/golden-summary.json", import.meta.url), "utf8"));
}

/** Runs the analyzer once with the locked golden options; shared across tests. */
export async function baselineAnalysis() {
  if (!cached) {
    const { runAnalysis } = await import("../src/lib/analyzer/run.ts");
    const result = runAnalysis(loadBaselineCsv(), {
      seriesEndsComplete: true,
      enableHtfDirectionFilter: true,
    });
    if (!result.ok) throw new Error(`baseline parse failed: ${result.error}`);
    cached = result.analysis;
  }
  return cached;
}

/** CSV authoring helper for adversarial regression fixtures. */
export const META =
  '# metadata: {"data_age":"2025-01-10 12:00:00 EAT","spread_convention":"XAUUSD: static estimate of $0.20 per ounce","turtle_tick_size":0.01,"atr_method":"x","similar_swing_selection_rule":"y"}';
export const HEADER =
  "datetime,open,high,low,close,direction,body,upper_wick,lower_wick,range,body_percent_of_range,upper_wick_pct,lower_wick_pct,displacement,is_reliable,local_avg_range,session,atr_30m,similar_swing_retrace_pct,similar_swing_continued_pct,similar_swing_refs,swing_context_source,swing_invalidated,reliable_streak_length";

export function eatDateTime(ms) {
  const eat = new Date(ms + 3 * 3600 * 1000);
  return `${eat.toISOString().slice(0, 10)} ${eat.toISOString().slice(11, 19)}`;
}

function csvEscape(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(
  datetime,
  o,
  h,
  l,
  c,
  { reliable = "true", atr = "5", session = "ny", refs = "[]" } = {},
) {
  const f = (v) => (typeof v === "number" ? String(v) : v);
  return [
    datetime, f(o), f(h), f(l), f(c),
    "Bullish", "1", "0", "0", "2", "50%", "0%", "0%", "No",
    reliable, "5", session, atr, "", "", refs, "", "false", "1",
  ].map(csvEscape).join(",");
}

export function makeCsv(rows) {
  return [META, HEADER, ...rows].join("\n");
}

/** Gentle synthetic price walk; startMs defaults to 2025-01-01 00:00 EAT. */
export function walkRows(n, { start = Date.parse("2025-01-01T00:00:00+03:00"), stepMs = 1800000, startPrice = 4000 } = {}) {
  const rows = [];
  let ms = start;
  let p = startPrice;
  for (let i = 0; i < n; i++) {
    p += Math.sin(i / 3) * 12 + (i % 11 === 0 ? 15 : -4);
    rows.push(
      csvRow(eatDateTime(ms), p.toFixed(2), (p + 8).toFixed(2), (p - 8).toFixed(2), (p + 1).toFixed(2)),
    );
    ms += stepMs;
  }
  return rows;
}
