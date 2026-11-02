#!/usr/bin/env node
/**
 * M3 — build the FROZEN spread cost table from real XAUUSD M1 bid+ask.
 *
 * This replaces the old static $0.20 one-sided spread in
 * src/lib/analyzer/math.ts. The old model was (a) half the real median,
 * (b) applied only to entry, and (c) blind to the 21:00 UTC rollover spike.
 *
 * Output buckets:
 *   session  = EAT session of the UTC timestamp (asian/london/ny)
 *   volRegime = trailing 30m realised range / price, split by FIXED absolute
 *               thresholds pre-registered at G0 (not fitted to P&L).
 *
 * For each cell we store count, median, p75, p95, max spread in price units.
 * The engine applies spread as a ROUND TRIP cost: half on entry, half on exit,
 * plus a separately frozen slippage term (see ENGINE-BIAS-REGISTER.md).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { sessionOfEat, formatNaive } from "./lib/dst.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RAW = join(ROOT, "artifacts/map-compass/raw");
const OUT = join(ROOT, "artifacts/map-compass");
const PINS = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const MONTHS = Object.keys(PINS)
  .filter((k) => /^bid_\d{4}_\d{2}$/.test(k))
  .map((k) => k.slice(4))
  .sort();

/** Frozen at G0. Trailing 30m high-low / price. Round numbers, not tuned. */
export const VOL_THRESHOLDS = Object.freeze({ low: 0.0006, high: 0.0016 });

function load(path) {
  const m = new Map();
  for (const f of dataLines(readFileSync(path, "utf8"), { delimiter: "," })) {
    if (f[0] === "timestamp") continue;
    const ts = Number(f[0]);
    const hi = num(f[2]),
      lo = num(f[3]),
      c = num(f[4]);
    if (Number.isFinite(ts) && hi !== undefined && lo !== undefined && c !== undefined) {
      m.set(ts, { hi, lo, c });
    }
  }
  return m;
}

const cells = new Map(); // "session|vol" -> spreads[]
const perMonth = [];
let matched = 0,
  unmatched = 0,
  negative = 0;

for (const mo of MONTHS) {
  const bp = join(RAW, `bid_${mo}.csv`),
    ap = join(RAW, `ask_${mo}.csv`);
  if (!existsSync(bp) || !existsSync(ap)) continue;
  const bid = load(bp),
    ask = load(ap);
  // trailing 30m realised range, causal (only past + current M1 bars)
  const window = [];
  let monthSpreads = [];
  const stamps = [...bid.keys()].sort((a, b) => a - b);
  for (const ts of stamps) {
    const a = ask.get(ts);
    if (!a) {
      unmatched++;
      continue;
    }
    const b = bid.get(ts);
    const spread = a.c - b.c;
    if (spread < 0) negative++;
    window.push({ ts, hi: b.hi, lo: b.lo, c: b.c });
    while (window.length && window[0].ts < ts - 30 * 60000) window.shift();
    if (window.length < 20) continue;
    const hi = Math.max(...window.map((w) => w.hi));
    const lo = Math.min(...window.map((w) => w.lo));
    const rel = (hi - lo) / b.c;
    const vol = rel < VOL_THRESHOLDS.low ? "low" : rel < VOL_THRESHOLDS.high ? "mid" : "high";
    // UTC -> EAT by +3h, then session from the EAT wall clock
    const session = sessionOfEat(formatNaive(ts + 3 * 3600000));
    if (!session) continue;
    const key = `${session}|${vol}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(spread);
    monthSpreads.push(spread);
    matched++;
  }
  if (monthSpreads.length) {
    const s = [...monthSpreads].sort((x, y) => x - y);
    perMonth.push({
      month: mo,
      n: s.length,
      median: +s[Math.floor(s.length / 2)].toFixed(4),
      p95: +s[Math.floor(0.95 * s.length)].toFixed(4),
      max: +s[s.length - 1].toFixed(4),
    });
  }
}

const quantile = (s, q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
const table = {};
for (const [key, values] of [...cells.entries()].sort()) {
  const s = values.sort((a, b) => a - b);
  table[key] = {
    n: s.length,
    median: +quantile(s, 0.5).toFixed(4),
    p75: +quantile(s, 0.75).toFixed(4),
    p95: +quantile(s, 0.95).toFixed(4),
    max: +s[s.length - 1].toFixed(4),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  source: "Dukascopy M1 bid+ask via kevingtlin/Market-Data-Lab (pinned git blob oids)",
  months: MONTHS.length,
  matchedMinutes: matched,
  unmatchedAsk: unmatched,
  negativeSpreads: negative,
  volThresholds: VOL_THRESHOLDS,
  convention:
    "spread = ask.close - bid.close, price units; applied as round-trip cost (half entry, half exit)",
  caveat:
    "Sampled months 2010-2026, not continuous coverage. Frozen at G0; must NOT be re-fit after seeing strategy results.",
  table,
  perMonth,
};
writeFileSync(join(OUT, "spread-table.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  `matched ${matched} M1 minutes, ${negative} negative spreads, ${Object.keys(table).length} cells`,
);
for (const [k, v] of Object.entries(table)) {
  console.log(
    `  ${k.padEnd(18)} n=${String(v.n).padStart(7)}  median=${v.median}  p95=${v.p95}  max=${v.max}`,
  );
}
