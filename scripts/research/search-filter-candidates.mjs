/**
 * Stage 3 — broad filter-candidate search (v1.8 research tooling).
 *
 * Runs the engine's A2-only book (Filter C off, Filter F off) and evaluates every
 * pair/triple of broad context atoms as a rejection rule, with significance,
 * fold/half recurrence, stress and breadth gates.
 *
 * The A2-only control book is pinned explicitly (enableFilterC: false,
 * enableFilterF: false) — `enableFilterF` alone is on by default since v1.8, so a
 * "Filter-C-off" run without that pin would silently be the C-off + F-on book.
 *
 * Run from the repository root:
 *
 *  node --experimental-strip-types --import ./tests/register.mjs scripts/research/search-filter-candidates.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
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
const batch = readFileSync(
  new URL("../../artifacts/strategy-research/all-trades.jsonl", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const batchByKey = new Map(batch.map((b) => [`${b.strategyId}|${b.datetime}|${b.side}`, b]));

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
    const risk = Math.abs(row.entry - row.sl);
    const p = eatParts(c.datetime);
    const day = dayIndex.get(p.day);
    const prior = day !== undefined && day > 0 ? daily[day - 1] : undefined;
    const e20 = ema20[i];
    const e50 = ema50[i];
    const e200 = ema200[i];
    const close = c.close;
    const b = batchByKey.get(`${row.strategyId}|${row.datetime}|${row.side}`);
    return {
      row,
      index: i,
      strategyId: row.strategyId,
      side,
      r: row.rMultiple ?? 0,
      f: {
        // production-semantics features
        pctl: atrPctl(i),
        session: sessionOf(c.datetime),
        hour: p.hour,
        dow: new Date(`${p.day}T00:00:00Z`).getUTCDay(),
        rr: row.rr,
        riskAtr: risk / a,
        rangeAtr: c.range / a,
        bodyPct: c.bodyPercentOfRange,
        upperWickPct: c.upperWickPct,
        lowerWickPct: c.lowerWickPct,
        counterTrend:
          (side === "long" && c.trend === "bearish") || (side === "short" && c.trend === "bullish"),
        htfOpposed: [t.h1, t.h4, t.d1].filter((v) => dirOf(v) === -sgn).length,
        htfAligned: [t.h1, t.h4, t.d1].filter((v) => dirOf(v) === sgn).length,
        h1: t.h1,
        h4: t.h4,
        localTrend: c.trend,
        // batch-vocabulary features (historical research definitions)
        bExtremeVol: !!b?.extremeVol,
        bHighVol: !!b?.highVol,
        bStackConflict: !!b?.emaStackConflict,
        bHtfConflict: !!b?.htfConflict,
        bDoji: !!b?.doji,
        bLondon: b?.session === "london",
        bVolHigh: b?.volRegime === "high",
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

function stats(mask) {
  const removed = [];
  const foldR = [0, 0, 0, 0];
  const halfR = [0, 0];
  const stratR = new Array(strategies.length).fill(0);
  let weekNeg = 0;
  const weekR = new Map();
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const r = rows[i].r;
    removed.push(r);
    foldR[foldOf[i]] += r;
    halfR[halfOf[i]] += r;
    stratR[stratOf[i]] += r;
    const wk = rows[i].row.datetime.slice(0, 7);
    weekR.set(wk, (weekR.get(wk) ?? 0) + r);
  }
  const cnt = removed.length;
  if (cnt === 0) return null;
  const sum = removed.reduce((a, b) => a + b, 0);
  const gain = -sum;
  const mean = sum / cnt;
  const sd = Math.sqrt(removed.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, cnt - 1));
  const t = sd > 0 ? -mean / (sd / Math.sqrt(cnt)) : 0;
  const minR = Math.min(...removed);
  const sortedAsc = removed.slice().sort((a, b) => a - b);
  const stressedGain = -(sum - minR);
  const stressedGain2 = -(sum - minR - (sortedAsc[1] ?? minR));
  const stratGain = stratR.map((v) => -v);
  const positives = stratGain.filter((v) => v > 0);
  const topShare = gain > 0 && positives.length ? Math.max(...positives) / gain : 0;
  const keptR = totalR - sum;
  const keptN = n - cnt;
  for (const v of weekR.values()) if (v < 0) weekNeg++;
  return {
    n: cnt,
    gain,
    t,
    meanR: mean,
    foldGain: foldR.map((v) => -v),
    halfGain: halfR.map((v) => -v),
    stratGain,
    strategiesNeg: stratGain.filter((v) => v > 0).length,
    topShare,
    stressedGain,
    stressedGain2,
    keptExp: keptN ? keptR / keptN : 0,
    baseExp: totalR / n,
    weekNeg,
    weekTotal: weekR.size,
  };
}

const GATES = (s, opts = {}) => {
  if (!s) return "empty";
  if (s.n < (opts.minN ?? 25)) return "n";
  if (s.gain < (opts.minGain ?? 12)) return "gain";
  if (s.t < (opts.minT ?? 2.0)) return "t";
  if (s.halfGain[0] <= 0 || s.halfGain[1] <= 0) return "half";
  if (s.foldGain.filter((g) => g > 0).length < 3) return "folds";
  if (s.stressedGain < 0.6 * s.gain) return "stress";
  if (s.keptExp <= s.baseExp) return "expectancy";
  if (!opts.skipBreadth) {
    if (s.strategiesNeg < 4) return "breadth";
    if (s.topShare > 0.6) return "topShare";
  }
  return null;
};

// ------------------------------------------------------------------- atom library
const ATOM = [];
const A = (label, fn) => ATOM.push({ label, fn });
A("counterTrend", (f) => f.counterTrend);
A("trendAligned", (f) => !f.counterTrend);
A("htfOpposed>=1", (f) => f.htfOpposed >= 1);
A("htfOpposed>=2", (f) => f.htfOpposed >= 2);
A("htfOpposed==3", (f) => f.htfOpposed === 3);
A("htfOpposed==0", (f) => f.htfOpposed === 0);
A("pctl>=0.80", (f) => f.pctl !== null && f.pctl >= 0.8);
A("pctl>=0.90", (f) => f.pctl !== null && f.pctl >= 0.9);
A("pctl>=0.95", (f) => f.pctl !== null && f.pctl >= 0.95);
A("pctl>=0.98", (f) => f.pctl !== null && f.pctl >= 0.98);
A("pctl<=0.20", (f) => f.pctl !== null && f.pctl <= 0.2);
A("pctl<=0.50", (f) => f.pctl !== null && f.pctl <= 0.5);
A("emaStackConflict", (f) => f.emaStackConflict);
A("session=london", (f) => f.session === "london");
A("session=ny", (f) => f.session === "ny");
A("session=asian", (f) => f.session === "asian");
A("hour 11-15", (f) => f.hour >= 11 && f.hour <= 15);
A("hour 12-14", (f) => f.hour >= 12 && f.hour <= 14);
A("hour 16-23", (f) => f.hour >= 16);
A("hour 0-2", (f) => f.hour <= 2);
A("dow 1&3&4", (f) => f.dow === 1 || f.dow === 3 || f.dow === 4);
A("dow 2&5", (f) => f.dow === 2 || f.dow === 5);
A("rangeAtr<=0.66", (f) => f.rangeAtr <= 0.66);
A("rangeAtr>=1.36", (f) => f.rangeAtr >= 1.36);
A("bodyPct<=28", (f) => f.bodyPct <= 28);
A("bodyPct>=83", (f) => f.bodyPct >= 83);
A("upperWickPct<=2.8", (f) => f.upperWickPct <= 2.8);
A("upperWickPct>=15", (f) => f.upperWickPct >= 15);
A("lowerWickPct>=39", (f) => f.lowerWickPct >= 39);
A("closeVsEma50Atr<=0.56", (f) => Number.isFinite(f.closeVsEma50Atr) && f.closeVsEma50Atr <= 0.56);
A("closeVsEma50Atr>=2.04", (f) => Number.isFinite(f.closeVsEma50Atr) && f.closeVsEma50Atr >= 2.04);
A(
  "closeVsEma200Atr<=-2.2",
  (f) => Number.isFinite(f.closeVsEma200Atr) && f.closeVsEma200Atr <= -2.2,
);
A("closeVsEma200Atr>=5.4", (f) => Number.isFinite(f.closeVsEma200Atr) && f.closeVsEma200Atr >= 5.4);
A("riskAtr<=0.84", (f) => f.riskAtr <= 0.84);
A("riskAtr>=1.89", (f) => f.riskAtr >= 1.89);
A("priorDayPos<=0.26", (f) => Number.isFinite(f.priorDayPos) && f.priorDayPos <= 0.26);
A("priorDayPos>=0.73", (f) => Number.isFinite(f.priorDayPos) && f.priorDayPos >= 0.73);
A("rr<=2.44", (f) => f.rr <= 2.44);
A("rr>=2.95", (f) => f.rr >= 2.95);
A("side=short", (f) => f.row?.side === "short"); // placeholder replaced below
ATOM.pop();
A("side", () => true);

const maskOf = (fn) => {
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    try {
      m[i] = fn(rows[i].f, rows[i]) ? 1 : 0;
    } catch {
      m[i] = 0;
    }
  }
  return m;
};

const atoms = ATOM.map((a) => ({ ...a, mask: maskOf(a.fn), s: stats(maskOf(a.fn)) }));
console.log(`atoms: ${atoms.length}`);
const broad = atoms.filter((a) => a.s && a.s.n >= 120).sort((a, b) => a.s.meanR - b.s.meanR);
console.log(`broad atoms (n>=120): ${broad.length}`);
console.log("\n-- broad atoms sorted by own mean R (worst first) --");
for (const a of broad) {
  const s = a.s;
  console.log(
    `  ${a.label.padEnd(26)} n=${String(s.n).padStart(4)} ownR=${(-s.gain).toFixed(1).padStart(7)} meanR=${s.meanR.toFixed(3).padStart(6)} ownT=${(-s.t).toFixed(2).padStart(5)}`,
  );
}

const results = [];
const consider = (label, mask, parts) => {
  const s = stats(mask);
  const fail = GATES(s);
  const failLoose = GATES(s, { minN: 20, minGain: 8, minT: 1.6 });
  if (!fail || !failLoose) results.push({ label, parts, s, fail });
};

let pairs = 0;
for (let i = 0; i < broad.length; i++) {
  for (let j = i + 1; j < broad.length; j++) {
    if (broad[i].label === broad[j].label) continue;
    const m = new Uint8Array(n);
    let cnt = 0;
    for (let k = 0; k < n; k++) {
      const v = broad[i].mask[k] && broad[j].mask[k] ? 1 : 0;
      m[k] = v;
      cnt += v;
    }
    pairs++;
    if (cnt < 18) continue;
    consider(`${broad[i].label} AND ${broad[j].label}`, m);
    // triples on top of pairs that are not hopelessly positive
    const ps = stats(m);
    if (!ps || ps.meanR > -0.05 || ps.n < 40) continue;
    for (const third of broad) {
      if (third.label === broad[i].label || third.label === broad[j].label) continue;
      const m3 = new Uint8Array(n);
      let c3 = 0;
      for (let k = 0; k < n; k++) {
        const v = m[k] && third.mask[k] ? 1 : 0;
        m3[k] = v;
        c3 += v;
      }
      if (c3 < 18) continue;
      consider(`${broad[i].label} AND ${broad[j].label} AND ${third.label}`, m3);
    }
  }
}
console.log(`\npairs evaluated: ${pairs}; candidates recorded: ${results.length}`);

const fmt = (s) =>
  `n=${String(s.n).padStart(4)} gain=${s.gain.toFixed(1).padStart(6)} t=${s.t.toFixed(2).padStart(5)} meanR=${s.meanR.toFixed(3).padStart(6)} halves=[${s.halfGain.map((g) => g.toFixed(0)).join(",")}] folds=[${s.foldGain.map((g) => g.toFixed(0)).join(",")}] stratNeg=${s.strategiesNeg} top=${s.topShare.toFixed(2)} stress=${s.stressedGain.toFixed(1)}/${s.stressedGain2.toFixed(1)} keptExp=${s.keptExp.toFixed(3)} weeks=${s.weekNeg}/${s.weekTotal}`;

const pass = results.filter((r) => r.fail === null).sort((a, b) => b.s.gain - a.s.gain);
console.log("\n== STRICT PASS ==");
if (pass.length === 0) console.log("(none)");
for (const r of pass.slice(0, 25)) console.log(`PASS ${r.label}\n     ${fmt(r.s)}`);

const near = results.filter((r) => r.fail !== null).sort((a, b) => b.s.gain - a.s.gain);
console.log("\n== NEAR MISS (16) ==");
for (const r of near.slice(0, 16)) console.log(`[${r.fail}] ${r.label}\n     ${fmt(r.s)}`);

writeFileSync(
  new URL("../../artifacts/strategy-research/filter-candidate-search.json", import.meta.url),
  JSON.stringify(
    {
      atoms: atoms.filter((a) => a.s).map((a) => ({ label: a.label, ...a.s })),
      passes: pass.map((r) => ({ label: r.label, ...r.s })),
      near: near.map((r) => ({ label: r.label, fail: r.fail, ...r.s })),
    },
    null,
    2,
  ),
);
console.log("\nwrote /tmp/scratch/search2-results.json");
