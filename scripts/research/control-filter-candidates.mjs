/**
 * Stage 4 — multiplicity control (v1.8 research tooling).
 *
 * Permutation (placebo) test: shuffle R across trades, re-run the whole pair/triple
 * search, count how many candidates would "pass" by chance. Then chronological
 * discovery -> validation: select rules on the first window, require reproduction
 * on the untouched second window (and the mirror direction).
 *
 * The A2-only control book is pinned explicitly (enableFilterC: false,
 * enableFilterF: false) — `enableFilterF` alone is on by default since v1.8, so a
 * "Filter-C-off" run without that pin would silently be the C-off + F-on book.
 *
 * Run from the repository root:
 *
 *  SHUFFLES=40 node --experimental-strip-types --import ./tests/register.mjs scripts/research/control-filter-candidates.mjs
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
    return {
      row,
      index: i,
      strategyId: row.strategyId,
      r: row.rMultiple ?? 0,
      f: {
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
        trendAligned: c.trend !== (side === "long" ? "bearish" : "bullish"),
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
// NOTE: trendAligned must key off the row's side; recompute properly.
rows.forEach((r) => {
  const side = trades.find((t) => t.index === r.index && t.strategyId === r.strategyId)?.side;
  r.f.trendAligned = !(
    (side === "long" && r.f.counterTrend) ||
    (side === "short" && r.f.counterTrend)
  );
});

const n = rows.length;
const foldOf = rows.map((_, i) => Math.min(3, Math.floor((i / n) * 4)));
const halfOf = rows.map((_, i) => (i < n / 2 ? 0 : 1));
const strategies = [...new Set(rows.map((r) => r.strategyId))];
const stratOf = rows.map((r) => strategies.indexOf(r.strategyId));
const realR = rows.map((r) => r.r);

function stats(mask, R, scope = null) {
  const removed = [];
  const foldR = [0, 0, 0, 0];
  const halfR = [0, 0];
  const stratR = new Array(strategies.length).fill(0);
  let cnt = 0;
  let totalR = 0;
  let totalN = 0;
  for (let i = 0; i < n; i++) {
    if (scope && scope[i] !== 1) continue;
    totalR += R[i];
    totalN++;
    if (!mask[i]) continue;
    cnt++;
    removed.push(R[i]);
    foldR[foldOf[i]] += R[i];
    halfR[halfOf[i]] += R[i];
    stratR[stratOf[i]] += R[i];
  }
  if (cnt === 0 || totalN === 0) return null;
  const sum = removed.reduce((a, b) => a + b, 0);
  const gain = -sum;
  const mean = sum / cnt;
  const sd = Math.sqrt(removed.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, cnt - 1));
  const t = sd > 0 ? -mean / (sd / Math.sqrt(cnt)) : 0;
  const minR = Math.min(...removed);
  const asc = removed.slice().sort((a, b) => a - b);
  const stressedGain = -(sum - minR);
  const stressedGain2 = -(sum - minR - (asc[1] ?? minR));
  const stratGain = stratR.map((v) => -v);
  const positives = stratGain.filter((v) => v > 0);
  const topShare = gain > 0 && positives.length ? Math.max(...positives) / gain : 0;
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
    keptExp: (totalR - sum) / (totalN - cnt),
    baseExp: totalR / totalN,
  };
}

const GATES = (s, o = {}) => {
  if (!s) return "empty";
  if (s.n < (o.minN ?? 25)) return "n";
  if (s.gain < (o.minGain ?? 12)) return "gain";
  if (s.t < (o.minT ?? 2.0)) return "t";
  const folds = o.folds ?? 3;
  if (s.foldGain.filter((g) => g > 0).length < folds) return "folds";
  if (s.halfGain[0] <= 0 || s.halfGain[1] <= 0) return "half";
  if (s.stressedGain < 0.6 * s.gain) return "stress";
  if (s.keptExp <= s.baseExp) return "expectancy";
  if (!o.skipBreadth) {
    if (s.strategiesNeg < 4) return "breadth";
    if (s.topShare > 0.6) return "topShare";
  }
  return null;
};

// ------------------------------------------------------------------ candidates
const ATOM = [
  ["counterTrend", (f) => f.counterTrend],
  ["trendAligned", (f) => f.trendAligned],
  ["htfOpposed>=1", (f) => f.htfOpposed >= 1],
  ["htfOpposed>=2", (f) => f.htfOpposed >= 2],
  ["htfOpposed==3", (f) => f.htfOpposed === 3],
  ["htfOpposed==0", (f) => f.htfOpposed === 0],
  ["pctl>=0.80", (f) => f.pctl !== null && f.pctl >= 0.8],
  ["pctl>=0.90", (f) => f.pctl !== null && f.pctl >= 0.9],
  ["pctl>=0.95", (f) => f.pctl !== null && f.pctl >= 0.95],
  ["pctl>=0.98", (f) => f.pctl !== null && f.pctl >= 0.98],
  ["pctl<=0.20", (f) => f.pctl !== null && f.pctl <= 0.2],
  ["pctl<=0.50", (f) => f.pctl !== null && f.pctl <= 0.5],
  ["emaStackConflict", (f) => f.emaStackConflict],
  ["session=london", (f) => f.session === "london"],
  ["session=ny", (f) => f.session === "ny"],
  ["session=asian", (f) => f.session === "asian"],
  ["hour 12-14", (f) => f.hour >= 12 && f.hour <= 14],
  ["hour 16-23", (f) => f.hour >= 16],
  ["hour 0-2", (f) => f.hour <= 2],
  ["dow 1&3&4", (f) => f.dow === 1 || f.dow === 3 || f.dow === 4],
  ["dow 2&5", (f) => f.dow === 2 || f.dow === 5],
  ["rangeAtr<=0.66", (f) => f.rangeAtr <= 0.66],
  ["rangeAtr>=1.36", (f) => f.rangeAtr >= 1.36],
  ["bodyPct<=28", (f) => f.bodyPct <= 28],
  ["bodyPct>=83", (f) => f.bodyPct >= 83],
  ["upperWickPct<=2.8", (f) => f.upperWickPct <= 2.8],
  ["upperWickPct>=15", (f) => f.upperWickPct >= 15],
  ["lowerWickPct>=39", (f) => f.lowerWickPct >= 39],
  ["closeVsEma50Atr<=0.56", (f) => Number.isFinite(f.closeVsEma50Atr) && f.closeVsEma50Atr <= 0.56],
  ["closeVsEma50Atr>=2.04", (f) => Number.isFinite(f.closeVsEma50Atr) && f.closeVsEma50Atr >= 2.04],
  [
    "closeVsEma200Atr<=-2.2",
    (f) => Number.isFinite(f.closeVsEma200Atr) && f.closeVsEma200Atr <= -2.2,
  ],
  [
    "closeVsEma200Atr>=5.4",
    (f) => Number.isFinite(f.closeVsEma200Atr) && f.closeVsEma200Atr >= 5.4,
  ],
  ["riskAtr<=0.84", (f) => f.riskAtr <= 0.84],
  ["riskAtr>=1.89", (f) => f.riskAtr >= 1.89],
  ["priorDayPos<=0.26", (f) => Number.isFinite(f.priorDayPos) && f.priorDayPos <= 0.26],
  ["priorDayPos>=0.73", (f) => Number.isFinite(f.priorDayPos) && f.priorDayPos >= 0.73],
  ["rr<=2.44", (f) => f.rr <= 2.44],
  ["rr>=2.95", (f) => f.rr >= 2.95],
].map(([label, fn], i) => {
  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    try {
      mask[k] = fn(rows[k].f, rows[k]) ? 1 : 0;
    } catch {
      mask[k] = 0;
    }
  }
  return { label, idx: i, mask };
});

// enumerate the same rule space once (pairs + triples on weak pairs)
const RULES = [];
for (let i = 0; i < ATOM.length; i++) {
  for (let j = i + 1; j < ATOM.length; j++) {
    const cnt = countAnd(ATOM[i].mask, ATOM[j].mask);
    if (cnt < 18) continue;
    const pairMask = andMask(ATOM[i].mask, ATOM[j].mask);
    const label = `${ATOM[i].label} AND ${ATOM[j].label}`;
    RULES.push({ label, mask: pairMask });
    if (cnt >= 40 && stats(pairMask, realR).meanR <= -0.05) {
      for (let k = 0; k < ATOM.length; k++) {
        if (k === i || k === j) continue;
        const c3 = countAnd(pairMask, ATOM[k].mask);
        if (c3 < 18) continue;
        RULES.push({
          label: `${label} AND ${ATOM[k].label}`,
          mask: andMask(pairMask, ATOM[k].mask),
        });
      }
    }
  }
}
function countAnd(a, b) {
  let c = 0;
  for (let i = 0; i < n; i++) if (a[i] && b[i]) c++;
  return c;
}
function andMask(a, b) {
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = a[i] && b[i] ? 1 : 0;
  return m;
}
console.log(`rule space: ${RULES.length} rules (${ATOM.length} atoms)`);

const realPasses = RULES.map((r) => ({ ...r, s: stats(r.mask, realR) })).filter((r) => !GATES(r.s));
console.log(`\nreal-data strict passes: ${realPasses.length}`);
const byLabel = new Map(realPasses.map((r) => [r.label, r]));
for (const r of realPasses.sort((a, b) => b.s.gain - a.s.gain).slice(0, 12)) {
  console.log(
    `  ${r.label}\n     n=${r.s.n} gain=${r.s.gain.toFixed(1)} t=${r.s.t.toFixed(2)} halves=[${r.s.halfGain.map((g) => g.toFixed(0))}] folds=[${r.s.foldGain.map((g) => g.toFixed(0))}] stratNeg=${r.s.strategiesNeg} top=${r.s.topShare.toFixed(2)} stress=${r.s.stressedGain.toFixed(1)}/${r.s.stressedGain2.toFixed(1)}`,
  );
}

// --------------------------------------------------------------- permutation
const SHUFFLES = Number(process.env.SHUFFLES ?? 60);
let totalFake = 0;
let maxFakeGain = 0;
let fakeWithBreadth = 0;
const scramSlot = new Array(n);
for (let s = 0; s < SHUFFLES; s++) {
  for (let i = 0; i < n; i++) scramSlot[i] = realR[i];
  // deterministic LCG shuffle (keeps runs comparable)
  let seed = 12345 + s * 7919;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = scramSlot[i];
    scramSlot[i] = scramSlot[j];
    scramSlot[j] = tmp;
  }
  let passes = 0;
  for (const r of RULES) {
    const s2 = stats(r.mask, scramSlot);
    if (!GATES(s2)) {
      passes++;
      if (s2.gain > maxFakeGain) maxFakeGain = s2.gain;
      if (s2.strategiesNeg >= 4) fakeWithBreadth++;
    }
  }
  totalFake += passes;
}
console.log(
  `\nplacebo (${SHUFFLES} outcome-shuffles): mean fake passes = ${(totalFake / SHUFFLES).toFixed(1)} per shuffle, max fake gain = ${maxFakeGain.toFixed(1)}, fake passes with breadth>=4 = ${(fakeWithBreadth / SHUFFLES).toFixed(1)}/shuffle`,
);

// ------------------------------------------- chronological discovery/validation
const discoveryGroups = [
  {
    name: "H1->H2",
    disc: rows.map((_, i) => (i < n / 2 ? 1 : 0)),
    val: rows.map((_, i) => (i >= n / 2 ? 1 : 0)),
  },
  {
    name: "H2->H1",
    disc: rows.map((_, i) => (i >= n / 2 ? 1 : 0)),
    val: rows.map((_, i) => (i < n / 2 ? 1 : 0)),
  },
  {
    name: "Q123->Q4",
    disc: rows.map((_, i) => (foldOf[i] < 3 ? 1 : 0)),
    val: rows.map((_, i) => (foldOf[i] === 3 ? 1 : 0)),
  },
  {
    name: "Q4..2->Q1",
    disc: rows.map((_, i) => (foldOf[i] > 0 ? 1 : 0)),
    val: rows.map((_, i) => (foldOf[i] === 0 ? 1 : 0)),
  },
];
console.log("\n== chronological discovery -> validation (independent halves) ==");
for (const g of discoveryGroups) {
  const survivors = [];
  for (const r of RULES) {
    const disc = stats(r.mask, realR, g.disc);
    const discFail = GATES(disc, { minN: 12, minGain: 6, minT: 1.8, folds: 2, skipBreadth: true });
    if (discFail) continue;
    const val = stats(r.mask, realR, g.val);
    if (!val || val.gain <= 0) continue;
    const valT = val.t;
    if (valT < 0.5) continue;
    survivors.push({ label: r.label, disc, val });
  }
  console.log(
    `${g.name}: ${survivors.length} rules discovered on the first window survive on the held-out window`,
  );
  for (const s of survivors.sort((a, b) => b.val.gain - a.val.gain).slice(0, 8)) {
    console.log(
      `   ${s.label}\n      disc: n=${s.disc.n} gain=${s.disc.gain.toFixed(1)} t=${s.disc.t.toFixed(2)} | val: n=${s.val.n} gain=${s.val.gain.toFixed(1)} t=${s.val.t.toFixed(2)} meanR=${s.val.meanR.toFixed(3)}`,
    );
  }
}

writeFileSync(
  new URL("../../artifacts/strategy-research/filter-multiplicity-control.json", import.meta.url),
  JSON.stringify(
    {
      ruleSpace: RULES.length,
      realPasses: realPasses.map((r) => ({ label: r.label, ...r.s })),
      placeboPerShuffle: totalFake / SHUFFLES,
      maxFakeGain,
      shuffles: SHUFFLES,
    },
    null,
    2,
  ),
);
console.log("\nwrote artifacts/strategy-research/filter-multiplicity-control.json");
