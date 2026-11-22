#!/usr/bin/env node
/**
 * Stage 4 — verdict harness (frozen engine, no modification).
 *
 * Usage:
 *   node --experimental-strip-types --import /tmp/frozen-core8/tests/register.mjs \
 *     scripts/rc-test-verdict.mjs --worktree /tmp/frozen-core8 \
 *       --csv artifacts/rc-test/unseen-2004-2019-eat-twoepoch.csv \
 *       --ids id1,id2,... --label "CORE-8" --out artifacts/rc-test/verdict-core8.json
 *
 * Frozen engine (worktree imports) — no src/ changes. Test harness only.
 * The frozen engine is NOT re-run with different parameters; we only change
 * the strategyIds + the DST-corrected CSV. Cost overlay is subtractive.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help") args.help = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
if (args.help || !args.worktree || !args.csv || !args.ids || !args.label || !args.out) {
  console.error("Usage: node ... scripts/rc-test-verdict.mjs --worktree <dir> --csv <file> --ids id1,id2,... --label <name> --out <file>");
  process.exit(args.help ? 0 : 2);
}
const WORKTREE = args.worktree;
const CSV_PATH = args.csv;
const IDS = args.ids.split(",").map((s) => s.trim()).filter(Boolean);
const OUT = args.out;

const enginePath = join(WORKTREE, "src/lib/analyzer/run.ts");
const registerPath = join(WORKTREE, "tests/register.mjs");
const { runAnalysis } = await import(enginePath);
const parseMod = await import(join(WORKTREE, "src/lib/analyzer/parse.ts"));
const pivotsMod = await import(join(WORKTREE, "src/lib/analyzer/pivots.ts"));

const costMod = await import(join(__dirname, "rc-test-frozen-cost.mjs"));
const { parseCsv } = parseMod;
const { atrSeries } = pivotsMod;

const text = readFileSync(CSV_PATH, "utf8");
const parsed = parseCsv(text);
if (!parsed.meta) { console.error("CSV parse error:", parsed.metadataError); process.exit(1); }
const candles = parsed.candles;
const valid = candles.filter((c) => !c.invalid);
const atr = atrSeries(candles);

const out = runAnalysis(text, {
  strategyIds: IDS,
  seriesEndsComplete: true,
  enableRegimeGate: true,
  enablePortfolioGate: true,
});
if (!out.ok) { console.error("engine FAILED:", out.error); process.exit(1); }
const a = out.analysis;
console.log("engine ok: trades(raw)=", a.tradePasses.length);

// --- trade rows: resolved only (TP/SL), trade-strategy only ---
const trades = [];
for (const row of a.tradePasses) {
  if (row.result !== "PASS") continue;
  if (row.outcome !== "TP" && row.outcome !== "SL") continue;
  if (row.side === undefined) continue;
  if (row.entry === undefined || row.sl === undefined || row.tp === undefined) continue;
  const i = row.index;
  const atr14 = atr[i];
  const bar = candles[i] ?? valid[i];
  const year = parseInt(row.datetime.slice(0, 4), 10);
  const session = costMod.sessionOfDatetime(row.datetime);
  const vol = (bar.high !== undefined && bar.low !== undefined && bar.close !== undefined)
    ? costMod.volRegimeOf({ h: bar.high, l: bar.low, c: bar.close })
    : "mid";
  const riskPrice = Math.abs(row.entry - row.sl);
  const costR = costMod.costRForTrade({ session, vol, year, atr14, riskPrice, slippageMultiplier: 1, variant: "baseline" });
  const costR2x = costMod.costRForTrade({ session, vol, year, atr14, riskPrice, slippageMultiplier: 2, variant: "baseline" });
  trades.push({
    strategyId: row.strategyId,
    side: row.side,
    datetime: row.datetime,
    year,
    session,
    vol,
    index: i,
    entry: row.entry,
    sl: row.sl,
    tp: row.tp,
    rr: row.rr,
    netR: row.rMultiple,                            // engine gross (includes tiny $0.20 embedded)
    costR: costR ?? 0,
    cost2xR: costR2x ?? 0,
    grossR: row.rMultiple,
  });
}
console.log("resolved trades across all bots:", trades.length);

// --- per-bot stats + gates ---
const byBot = new Map();
for (const t of trades) {
  if (!byBot.has(t.strategyId)) byBot.set(t.strategyId, []);
  byBot.get(t.strategyId).push(t);
}

// --- random baseline: ≥4000 draws per (bot, side), stratified by session+vol ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANDOM_SEED = 20261026;
const RANDOM_TOPUP_SEED = RANDOM_SEED + 7919;
const MAX_HOLD = 96;
const STOP_MULT = 1.5;
const TARGET_R = 2.0;

function randomBaselineForSegment(botId, side, botTrades, barPool, atr) {
  // stratify draws across the bot's real (session, vol) distribution
  const dist = new Map(); // key -> weight
  for (const t of botTrades) {
    const k = `${t.session}|${t.vol}`;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  const keys = [...dist.keys()];
  const samples = [];
  const rng = mulberry32(RANDOM_SEED);
  const oneSide = side; // "long" | "short"
  // bars in the window with valid atr and 96-bar room
  const pool = barPool.filter((b) => b.atr !== undefined && b.atr > 0 && b.i + 1 + MAX_HOLD < barPool.length);
  // seed pool indices stratified by (session, vol)
  const poolBySV = new Map();
  for (const b of pool) {
    const k = `${costMod.sessionOfDatetime(b.datetime)}|${costMod.volRegimeOf(b)}`;
    if (!poolBySV.has(k)) poolBySV.set(k, []);
    poolBySV.get(k).push(b);
  }
  const total = [...dist.values()].reduce((a, b) => a + b, 0) || 1;
  // one-slot blocking: track open trade (one position per segment)
  let open = null; // { closeBarIndex }
  // iterate bars in time order-ish: bucket starts per draw
  // build a drawing phase: iterate potential entry bars, pick by stratified probability
  const drawCount = 12000;
  const draws = [];
  // Build per-bar candidates until we have enough samples or pool exhausted
  const perBarSlots = [];
  for (let i = 0; i < barPool.length; i++) {
    const b = barPool[i];
    if (b.atr === undefined || b.atr <= 0) continue;
    if (b.i + 1 + MAX_HOLD >= barPool.length) continue;
    perBarSlots.push(i);
  }
  // stratified pool indices: pick from bars whose (session,vol) matches the most likely bucket
  const chosenBars = [];
  // leverage the bot's real trades to weight which bar to sample
  const barsBySV = poolBySV;
  // deterministic order: cycle through the bot's real-trade (session,vol) dist, each draw picks one bar
  for (let s = 0; s < drawCount; s++) {
    const k = keys[s % keys.length] ?? keys[0];
    const bucket = barsBySV.get(k);
    if (!bucket || !bucket.length) continue;
    const pick = bucket[Math.floor(rng() * bucket.length)];
    draws.push(pick);
  }
  // one-slot blocking over the draws sorted by time (skip if slot occupied)
  const sorted = draws.slice().sort((a, b) => a.i - b.i);
  const accepted = [];
  for (const pick of sorted) {
    if (open !== null && pick.i <= open) continue; // slot still open
    // resolve the trade
    const entry = pick.c;
    const risk = STOP_MULT * pick.atr;
    const stop = oneSide === "long" ? entry - risk : entry + risk;
    const target = oneSide === "long" ? entry + TARGET_R * risk : entry - TARGET_R * risk;
    const lastBar = Math.min(pick.i + 1 + MAX_HOLD, barPool.length);
    let result = null;
    for (let j = pick.i + 1; j < lastBar; j++) {
      const b = barPool[j];
      const gapStop = oneSide === "long" ? b.o <= stop : b.o >= stop;
      const gapTarget = oneSide === "long" ? b.o >= target : b.o <= target;
      if (gapStop) { result = { outcome: "SL", price: b.o, exitIndex: j }; break; }
      if (gapTarget) { result = { outcome: "TP", price: b.o, exitIndex: j }; break; }
      const hitStop = oneSide === "long" ? b.l <= stop : b.h >= stop;
      const hitTarget = oneSide === "long" ? b.h >= target : b.l <= target;
      if (hitStop && hitTarget) { result = { outcome: "SL", price: stop, exitIndex: j }; break; }
      if (hitStop) { result = { outcome: "SL", price: stop, exitIndex: j }; break; }
      if (hitTarget) { result = { outcome: "TP", price: target, exitIndex: j }; break; }
    }
    if (!result) {
      const exitBar = Math.min(lastBar - 1, barPool.length - 1);
      const exitPrice = barPool[exitBar].c;
      const signed = oneSide === "long" ? exitPrice - entry : entry - exitPrice;
      const grossR = signed / risk;
      const costR = costMod.costRForTrade({ session: pick.session, vol: pick.vol, year: pick.year, atr14: pick.atr, riskPrice: risk, slippageMultiplier: 1, variant: "baseline" });
      result = { outcome: "TIME_EXIT", price: exitPrice, exitIndex: exitBar, grossR };
      const cost = costR ?? 0;
      samples.push({ netR: grossR - cost, grossR, outcome: "TIME_EXIT", year: pick.year, session: pick.session, vol: pick.vol, side: oneSide, day: pick.datetime.slice(0, 10) });
      open = result.exitIndex;
      continue;
    }
    const signed = oneSide === "long" ? result.price - entry : entry - result.price;
    const grossR = signed / risk;
    const costR = costMod.costRForTrade({ session: pick.session, vol: pick.vol, year: pick.year, atr14: pick.atr, riskPrice: risk, slippageMultiplier: 1, variant: "baseline" });
    const cost = costR ?? 0;
    samples.push({ netR: grossR - cost, grossR, outcome: result.outcome, year: pick.year, session: pick.session, vol: pick.vol, side: oneSide, day: pick.datetime.slice(0, 10) });
    open = result.exitIndex;
  }
  return samples;
}

// build bar pool with session/vol/year
const bars = valid.map((b) => ({
  i: b.index,
  datetime: b.datetime,
  c: b.close, o: b.open, h: b.high, l: b.low,
  atr: atr[b.index] ?? undefined,
  session: costMod.sessionOfDatetime(b.datetime),
  vol: (b.high !== undefined && b.low !== undefined && b.close !== undefined) ? costMod.volRegimeOf({ h: b.high, l: b.low, c: b.close }) : "mid",
  year: parseInt(b.datetime.slice(0, 4), 10),
}));

const segments = [];
for (const [botId, botTrades] of byBot) {
  for (const side of ["long", "short"]) {
    const sideTrades = botTrades.filter((t) => t.side === side);
    if (sideTrades.length === 0) continue;
    const samples = randomBaselineForSegment(botId, side, sideTrades, bars, atr);
    segments.push({ botId, side, real: sideTrades, samples });
  }
}

// --- stats helpers ---
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
};
function ci95(m, se) { return [m - 1.96 * se, m + 1.96 * se]; }
function clusterSe(values, keys) {
  const N = values.length;
  if (N < 2) return { se: 0, clusters: N ? 1 : 0, plainSe: 0 };
  const m = mean(values);
  const sums = new Map();
  for (let i = 0; i < N; i++) {
    const k = keys[i] ?? `__row_${i}`;
    sums.set(k, (sums.get(k) ?? 0) + (values[i] - m));
  }
  const G = sums.size;
  let meat = 0;
  for (const s of sums.values()) meat += s * s;
  const correction = G > 1 ? G / (G - 1) : 1;
  const se = Math.sqrt((correction * meat) / (N * N));
  let ss = 0;
  for (const v of values) ss += (v - m) ** 2;
  return { se, clusters: G, plainSe: Math.sqrt(ss / (N - 1) / N) };
}

function summarize(trades, samples, fallbackBotId = "?") {
  if (!trades || trades.length === 0) return null;
  const gross = trades.map((t) => t.grossR);
  const nets = trades.map((t) => t.netR);          // engine gross (as built)
  const netMeasured = trades.map((t) => t.netR - t.costR);  // subtract measured cost
  const net2x = trades.map((t) => t.netR - 2 * t.costR);    // 2x cost lens
  const days = trades.map((t) => t.datetime.slice(0, 10));
  const n = trades.length;
  const mNetMeasured = mean(netMeasured);
  const se = clusterSe(netMeasured, days).se;
  const tNetMeasured = se > 0 ? mNetMeasured / se : 0;
  const totalR = gross.reduce((a, b) => a + b, 0);
  const totalNetMeasured = netMeasured.reduce((a, b) => a + b, 0);
  // per-year
  const byYear = new Map();
  for (const t of trades) {
    if (!byYear.has(t.year)) byYear.set(t.year, { trades: 0, net: 0, netMeasured: 0 });
    const y = byYear.get(t.year);
    y.trades++; y.net += t.grossR; y.netMeasured += t.netR - t.costR;
  }
  // concentration
  const yearR = [...byYear.values()].map((y) => y.netMeasured);
  const maxAbsYear = Math.max(...yearR.map((r) => Math.abs(r)));
  const totalMeasured = netMeasured.reduce((a, b) => a + b, 0);
  const concentration = totalMeasured > 0 ? maxAbsYear / totalMeasured : 1;
  // LOYO
  const windows = [];
  for (const yr of [...byYear.keys()].sort()) {
    let net = 0;
    for (const t of trades) if (t.year !== yr) net += t.netR - t.costR;
    windows.push({ year: yr, net });
  }
  const loyoPositive = windows.filter((w) => w.net > 0).length;
  // excess over random (side-matched baseline)
  const realNets = trades.map((t) => t.netR - t.costR);
  const baseNets = samples.map((s) => s.netR);
  const excess = mean(realNets) - mean(baseNets);
  const baseDays = samples.map((s) => s.day);
  const excessVals = trades.map((t, i) => (t.netR - t.costR) - 0); // first arg: real nets minus baseline means
  // CR1 day-cluster t of excess: compute real net clustered by day, baseline as reference
  const baseMean = mean(baseNets);
  const excessByTrade = trades.map((t, i) => (t.netR - t.costR) - baseMean);
  const excessDays = trades.map((t) => t.datetime.slice(0, 10));
  const tExc = clusterSe(excessByTrade, excessDays);
  const tExcStat = tExc.se > 0 ? mean(excessByTrade) / tExc.se : 0;
  // 2x cost lens
  const engine2x = trades.map((t) => t.netR - 2 * t.costR);
  const net2xMean = mean(engine2x);
  // wins
  const wins = trades.filter((t) => t.netR - t.costR > 0).length;
  return {
    botId: fallbackBotId,
    trades: n,
    resolved: n,
    longs: trades.filter((t) => t.side === "long").length,
    shorts: trades.filter((t) => t.side === "short").length,
    totalGrossR: totalR,
    totalNetR_measured: totalMeasured,
    meanGrossR: mean(gross),
    meanNetRMeasured: mNetMeasured,
    t_netMeasured: +tNetMeasured.toFixed(3),
    excessVsRandomR: +excess.toFixed(4),
    t_excess: +tExcStat.toFixed(3),
    wins: wins,
    wr: wins / (n || 1),
    yearR: [...byYear.entries()].map(([year, v]) => ({ year, trades: v.trades, net: +v.netMeasured.toFixed(3) })),
    concentration: +concentration.toFixed(3),
    loyoPositive: loyoPositive,
    loyoTotal: windows.length,
    loyoFraction: +(loyoPositive / (windows.length || 1)).toFixed(3),
    net2xMean: +net2xMean.toFixed(4),
    net2xSum: engine2x.reduce((a, b) => a + b, 0),
    randomBaseline: {
      drawCount: samples.length,
      meanNetR: mean(baseNets),
      sdReal: sd(realNets),
      seExcess: tExc.se,
      baseSd: sd(baseNets),
      meta: { seed: RANDOM_SEED, topupSeed: RANDOM_TOPUP_SEED, maxHold: MAX_HOLD, stopMult: STOP_MULT, targetR: TARGET_R },
    },
  };
}

// build segments + stats
const perBot = [];
for (const [botId, botTrades] of byBot) {
  // gather baseline samples across both sides
  const sideSegs = segments.filter((s) => s.botId === botId);
  const allBaseline = sideSegs.flatMap((s) => s.samples);
  const sideStats = {};
  for (const side of ["long", "short"]) {
    const sideTrades = botTrades.filter((t) => t.side === side);
    const sideSeg = sideSegs.find((s) => s.side === side);
    sideStats[side] = summarize(sideTrades, sideSeg?.samples ?? [], botId);
  }
  const pooled = summarize(botTrades, allBaseline, botId);
  perBot.push({
    ...pooled,
    sideStats,
    randomBaseline: {
      drawCount: allBaseline.length,
      meanNetR: allBaseline.length ? mean(allBaseline.map((s) => s.netR)) : 0,
      sd: allBaseline.length ? sd(allBaseline.map((s) => s.netR)) : 0,
    },
  });
}

// --- PASS gates (hard bar) ---
function passGates(bot, baseMean) {
  const gates = {};
  gates.minTrades = bot.trades >= 100;
  gates.netMean = bot.meanNetRMeasured > 0.10;
  gates.tNet = bot.t_netMeasured > 2;
  gates.excessExcess = bot.excessVsRandomR > 0;
  gates.tExcess = bot.t_excess > 2;
  gates.concentration = bot.concentration <= 0.5;
  gates.loyo = bot.loyoFraction >= 0.75;
  gates.net2x = bot.net2xSum > 0;
  const allPass = Object.values(gates).every(Boolean);
  return { gates, pass: allPass };
}

const verdictRows = perBot.map((b) => {
  const { gates, pass } = passGates(b, null);
  return {
    ...b,
    gates,
    pass,
  };
});

const summary = {
  label: args.label,
  worktree: WORKTREE,
  csv: CSV_PATH,
  strategyIds: IDS,
  generatedAt: new Date().toISOString(),
  rowCounts: {
    totalTradeRows: trades.length,
    perBot: byBot.size,
  },
  perBot: verdictRows,
};

writeFileSync(OUT, JSON.stringify(summary, (k, v) => (v === undefined ? null : v), 2));
console.log("=== verdict rows ===");
for (const v of verdictRows) {
  console.log(`${v.botId.padEnd(38)} T=${String(v.trades).padStart(4)} R=${v.totalNetR_measured.toFixed(2).padStart(8)} net${
    v.pass ? " PASS" : " FAIL"} excess=${v.excessVsRandomR.toFixed(3)} t=${v.t_excess.toFixed(2)} net2x=${v.net2xSum.toFixed(2)} conc=${v.concentration.toFixed(2)} loyo=${v.loyoPositive}/${v.loyoTotal} rN=${v.randomBaseline.drawCount}`);
}
console.log("wrote", OUT);
