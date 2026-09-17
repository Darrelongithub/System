/**
 * Stage 5 — finalist family report (v1.8 research tooling).
 *
 * Reports the finalist rejection families against the A2-only book: standalone
 * strength, recurrence, breadth, incremental value over the shipped Filter C, and
 * what the book would look like with the family added on top of C.
 *
 * The A2-only control book is pinned explicitly (enableFilterC: false,
 * enableFilterF: false) — `enableFilterF` alone is on by default since v1.8, so a
 * "Filter-C-off" run without that pin would silently be the C-off + F-on book.
 *
 * Run from the repository root:
 *
 *  node --experimental-strip-types --import ./tests/register.mjs scripts/research/report-filter-families.mjs
 */

// ---------------------------------------------------------------------------
// Guardrail (added with the v1.8 live-fidelity review): this is a DISCOVERY
// tool, not a validation tool. Any rule it turns up is selected on the same
// locked baseline every earlier search used, so a "pass" here is in-sample by
// construction and cannot justify a default change — see FORWARD-VALIDATION.md.
// Requiring an explicit acknowledgement keeps a casual re-run from looking like
// fresh evidence.
// ---------------------------------------------------------------------------
if (process.env.ALLOW_DISCOVERY_SEARCH !== "yes") {
  console.error(
    "This is a discovery tool: it mines the SAME series the shipped rules were\n" +
      "selected on, so it cannot produce out-of-sample evidence. Results are hypotheses only.\n" +
      "Re-run with ALLOW_DISCOVERY_SEARCH=yes if that is what you want, or evaluate the\n" +
      "SHIPPED rules on new data with scripts/research/validate-on-new-data.mjs.",
  );
  process.exit(2);
}

import { readFileSync } from "node:fs";
import { runAnalysis } from "../../src/lib/analyzer/run.ts";
import { parseCsv } from "../../src/lib/analyzer/parse.ts";
import { atrSeries } from "../../src/lib/analyzer/pivots.ts";
import { ema } from "../../src/lib/analyzer/indicators.ts";
import { dailyAggregates } from "../../src/lib/analyzer/daily.ts";
import {
  buildIndex,
  computeHtfTrendContext,
  computeMarketStructure,
} from "../../src/lib/analyzer/structure.ts";
import { eatParts, sessionOf } from "../../src/lib/analyzer/time.ts";
import { isTradeStrategy } from "../../src/lib/analyzer/strategy-kind.ts";

const CSV = new URL("../../artifacts/baseline-xauusd-ohlc.csv", import.meta.url);
const csv = readFileSync(CSV, "utf8");
const a2 = runAnalysis(csv, {
  seriesEndsComplete: true,
  enableFilterC: false,
  enableFilterF: false,
});
if (!a2.ok) throw new Error(a2.error);
const trades = a2.analysis.results.filter(
  (r) => r.result === "PASS" && isTradeStrategy(r.strategyId),
);

const parsed = parseCsv(csv);
const candles = parsed.candles;
const byDatetime = buildIndex(candles);
computeMarketStructure(candles, byDatetime);
const htf = computeHtfTrendContext(candles);
const atr = atrSeries(candles);
const ema20 = ema(candles, 20);
const ema50 = ema(candles, 50);
const ema200 = ema(candles, 200);
const daily = dailyAggregates(candles);
const dayIndex = new Map(daily.map((d, i) => [d.day, i]));
const W = 50;
const atrPctl = (i) => {
  const a = atr[i];
  if (a === undefined || !Number.isFinite(a) || i - W < 0) return null;
  const past = [];
  for (let j = i - W; j < i; j++) {
    const v = atr[j];
    if (v !== undefined && Number.isFinite(v)) past.push(v);
  }
  if (past.length < W) return null;
  let le = 0;
  for (const v of past) if (v <= a) le++;
  return le / past.length;
};

const rows = trades
  .map((row) => {
    const i = row.index;
    const c = candles[i];
    const a = atr[i];
    const side = row.side;
    const sgn = side === "long" ? 1 : -1;
    const t = htf[i];
    const dirOf = (v) => (v === "bullish" ? 1 : v === "bearish" ? -1 : 0);
    const p = eatParts(c.datetime);
    const day = dayIndex.get(p.day);
    const prior = day !== undefined && day > 0 ? daily[day - 1] : undefined;
    const e20 = ema20[i];
    const e50 = ema50[i];
    const e200 = ema200[i];
    const close = c.close;
    const range = c.range;
    const upperWickPct = range > 0 ? (c.high - Math.max(c.open, c.close)) / range : NaN;
    const lowerWickPct = range > 0 ? (Math.min(c.open, c.close) - c.low) / range : NaN;
    const bodyPct = range > 0 ? Math.abs(c.close - c.open) / range : NaN;
    return {
      row,
      index: i,
      strategyId: row.strategyId,
      side,
      r: row.rMultiple ?? 0,
      f: {
        pctl: atrPctl(i),
        session: sessionOf(c.datetime),
        hour: p.hour,
        dow: new Date(`${p.day}T00:00:00Z`).getUTCDay(),
        rr: row.rr,
        riskAtr: Math.abs(row.entry - row.sl) / a,
        rangeAtr: range / a,
        bodyPct,
        upperWickPct,
        lowerWickPct,
        counterTrend:
          (side === "long" && c.trend === "bearish") || (side === "short" && c.trend === "bullish"),
        htfOpposed: [t.h1, t.h4, t.d1].filter((v) => dirOf(v) === -sgn).length,
        emaStackConflict:
          e20 !== undefined && e50 !== undefined && e200 !== undefined
            ? !((e20 > e50 && e50 > e200) || (e20 < e50 && e50 < e200))
            : false,
        closeVsEma50Atr: e50 !== undefined && close !== undefined ? ((close - e50) / a) * sgn : NaN,
        closeVsEma200Atr:
          e200 !== undefined && close !== undefined ? ((close - e200) / a) * sgn : NaN,
        priorDayPos: prior ? (row.entry - prior.low) / (prior.high - prior.low) : NaN,
      },
    };
  })
  .sort((a, b) => a.index - b.index);

const n = rows.length;
const totalR = rows.reduce((s, r) => s + r.r, 0);
const foldOf = rows.map((_, i) => Math.min(3, Math.floor((i / n) * 4)));
const halfOf = rows.map((_, i) => (i < n / 2 ? 0 : 1));
const strategies = [...new Set(rows.map((r) => r.strategyId))];
const stratOf = rows.map((r) => strategies.indexOf(r.strategyId));
const isC = rows.map((x) => x.f.counterTrend && x.f.pctl !== null && x.f.pctl >= 0.95);

const FAMILIES = {
  C_current: () => isC[0] && true,
  B_fadeStrongBar: (f) => f.counterTrend && f.upperWickPct <= 0.028 && f.bodyPct >= 0.83,
  B2_fadeStrongBar_body: (f) => f.counterTrend && f.bodyPct >= 0.83 && f.upperWickPct <= 0.028,
  D_conflict_nearPDL: (f) =>
    f.emaStackConflict &&
    Number.isFinite(f.priorDayPos) &&
    f.priorDayPos <= 0.26 &&
    !f.counterTrend,
  E_ny_weakRange: (f) => f.session === "ny" && f.rangeAtr <= 0.66,
  E2_ny_weakRange_ct: (f) => f.session === "ny" && f.rangeAtr <= 0.66 && f.counterTrend,
  E3_ny_weakRange_dow: (f) =>
    f.session === "ny" && f.rangeAtr <= 0.66 && (f.dow === 1 || f.dow === 3 || f.dow === 4),
  F_london_weak: (f) => f.session === "london" && f.closeVsEma50Atr <= 0.56 && f.counterTrend,
};

const maskOf = (fn) => {
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    try {
      m[i] = fn(rows[i].f) ? 1 : 0;
    } catch {
      m[i] = 0;
    }
  }
  return m;
};

function report(label, mask) {
  const sel = rows.filter((_, i) => mask[i]);
  const sum = sel.reduce((s, x) => s + x.r, 0);
  const gain = -sum;
  const mean = sel.length ? sum / sel.length : 0;
  const sd = Math.sqrt(
    sel.reduce((s, x) => s + (x.r - mean) ** 2, 0) / Math.max(1, sel.length - 1),
  );
  const t = sel.length ? -mean / (sd / Math.sqrt(sel.length)) : 0;
  const foldGain = [0, 0, 0, 0];
  const halfGain = [0, 0];
  const stratGain = new Array(strategies.length).fill(0);
  let overlapC = 0;
  let overlapCn = 0;
  const sides = { long: 0, short: 0 };
  for (const x of sel) {
    foldGain[foldOf[rows.indexOf(x)]] -= x.r;
    halfGain[halfOf[rows.indexOf(x)]] -= x.r;
    stratGain[stratOf[rows.indexOf(x)]] -= x.r;
    sides[x.side]++;
  }
  for (let i = 0; i < n; i++) {
    if (mask[i] && isC[i]) overlapC++;
    if (mask[i] && !isC[i]) overlapCn++;
  }
  const sortedDesc = sel.slice().sort((a, b) => b.r - a.r);
  const stress = -(sum - Math.min(...sel.map((x) => x.r)));
  console.log(
    `\n${label}\n  n=${sel.length} (${((sel.length / n) * 100).toFixed(1)}%) ownR=${sum.toFixed(1)} gain=${gain.toFixed(1)} meanR=${mean.toFixed(3)} t=${t.toFixed(2)} WR=${((sel.filter((x) => x.r > 0).length / Math.max(1, sel.length)) * 100).toFixed(1)}%\n  sides=${JSON.stringify(sides)} halves=[${halfGain.map((g) => g.toFixed(0))}] folds=[${foldGain.map((g) => g.toFixed(0))}] stress=${stress.toFixed(1)}\n  overlap with FilterC: ${overlapC} (of ${isC.filter(Boolean).length}) | incremental removals: ${overlapCn}\n  incremental gain (excluding C-rejected): ${(-sel
      .filter((x) => !isC[rows.indexOf(x)])
      .reduce((s, x) => s + x.r, 0)).toFixed(
      1,
    )}  incremental n=${overlapCn}\n  perStrategy: ${strategies.map((s, i) => `${s}=${stratGain[i].toFixed(1)}`).join(" ")}\n  worst3: ${sortedDesc
      .slice(0, 3)
      .map((x) => x.r.toFixed(1))
      .join(", ")}`,
  );
}

for (const [label, fn] of Object.entries(FAMILIES)) {
  if (label === "C_current") continue;
  report(label, maskOf(fn));
}
report("C_current (reference)", isC);

// ---- incremental: C + family (union of masks) vs C alone
console.log("\n== union with Filter C (what the book becomes) ==");
// Book R = A2 total R minus the R of every rejected trade (rejected trades are
// the ones the filter removes, so their summed R is negative when the filter
// helps). The C-only baseline uses the same convention — an earlier version of
// this script added the C sum instead of subtracting it and inflated every
// delta by exactly 2 x |C sum| = 48.4 R.
const rejectedRSun = (mask) => rows.reduce((s, x, i) => (mask[i] ? s + x.r : s), 0);
const cOnlyKeptR = totalR - rejectedRSun(isC);
console.log(
  `  C only (reference)     rejected=${String(isC.filter(Boolean).length).padStart(4)} keptR=${cOnlyKeptR.toFixed(1)}`,
);
for (const [label, fn] of Object.entries(FAMILIES)) {
  if (label === "C_current") continue;
  const m = maskOf(fn);
  const union = new Uint8Array(n);
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const u = m[i] || isC[i] ? 1 : 0;
    union[i] = u;
    if (u) cnt++;
  }
  const keptR = totalR - rejectedRSun(union);
  console.log(
    `  ${label.padEnd(22)} rejected=${String(cnt).padStart(4)} keptR=${keptR.toFixed(1)} delta=+${(keptR - cOnlyKeptR).toFixed(1)}`,
  );
}
