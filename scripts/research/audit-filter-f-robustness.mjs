/**
 * Filter F robustness audit (v1.8 research tooling — frozen rule, no search).
 *
 * Filter F was chosen on the discovery series (the locked baseline). This audit
 * does NOT look for a better rule and does NOT change any threshold: it asks
 * whether the *mechanism* is recurrent inside that series or an artifact of one
 * window/strategy/side.
 *
 * Slices, all engine-level (`runAnalysis` with the flag on and off, never a
 * drop-model approximation):
 *   - per calendar month, each slice run with a warm-up prefix so indicators and
 *     the dedupe state match a full-history run (see WARMUP_BARS)
 *   - per strategy
 *   - per side
 *   - per session
 *
 * ΔR is R(Filter F on) − R(Filter F off), i.e. the value Filter F adds on top of
 * Filter C. A slice where ΔR is negative is a slice where F costs money.
 *
 * Run from the repository root:
 *
 *   node --experimental-strip-types --import ./tests/register.mjs scripts/research/audit-filter-f-robustness.mjs
 */
import { readFileSync } from "node:fs";
import { runAnalysis } from "../../src/lib/analyzer/run.ts";
import { isTradeStrategy } from "../../src/lib/analyzer/strategy-kind.ts";

const WARMUP_BARS = 1500; // > the measured sufficiency floor of 1000 bars

const csv = readFileSync(
  new URL("../../artifacts/baseline-xauusd-ohlc.csv", import.meta.url),
  "utf8",
);
const lines = csv.split("\n");
const META = lines[0];
const HEADER = lines[1];
const DATA = lines.slice(2).filter((l) => l.trim() !== "");
const mk = (rows) => [META, HEADER, ...rows].join("\n");

const run = (rows, filterF) => {
  const out = runAnalysis(mk(rows), { seriesEndsComplete: true, enableFilterF: filterF });
  if (!out.ok) throw new Error(out.error);
  return out.analysis.results.filter((r) => r.result === "PASS" && isTradeStrategy(r.strategyId));
};

const R = (rows) => rows.reduce((s, t) => s + (t.rMultiple ?? 0), 0);
const monthOf = (r) => r.datetime.slice(0, 7);

// ---- per month, with warm-up + de-dupe state carried in --------------------
console.log("== per calendar month (engine, warm-up prefix " + WARMUP_BARS + " bars) ==");
const months = [...new Set(DATA.map((l) => l.slice(0, 7)))];
let better = 0;
let worse = 0;
for (const month of months) {
  const first = DATA.findIndex((l) => l.startsWith(month));
  const last = DATA.findLastIndex((l) => l.startsWith(month));
  const start = Math.max(0, first - WARMUP_BARS);
  const slice = DATA.slice(start, last + 1);
  const inMonth = (r) => monthOf(r) === month;
  const on = run(slice, true).filter(inMonth);
  const off = run(slice, false).filter(inMonth);
  const delta = R(on) - R(off);
  if (delta > 0) better++;
  else if (delta < 0) worse++;
  console.log(
    `  ${month}  F on: ${String(on.length).padStart(3)} trades / R ${R(on).toFixed(1).padStart(7)}   F off: ${String(off.length).padStart(3)} / R ${R(off).toFixed(1).padStart(7)}   ΔR ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`,
  );
}
console.log(`  months where F helps: ${better} | where F costs: ${worse} | total ${months.length}`);

// ---- per strategy / side / session (full series) --------------------------
const on = run(DATA, true);
const off = run(DATA, false);
console.log("\n== per strategy (full series) ==");
const ids = [...new Set([...on, ...off].map((t) => t.strategyId))].sort();
for (const id of ids) {
  const a = on.filter((t) => t.strategyId === id);
  const b = off.filter((t) => t.strategyId === id);
  const delta = R(a) - R(b);
  const removed = b.length - a.length;
  console.log(
    `  ${id.padEnd(15)} F on ${String(a.length).padStart(3)}/${R(a).toFixed(1).padStart(7)}  F off ${String(b.length).padStart(3)}/${R(b).toFixed(1).padStart(7)}  removed ${String(removed).padStart(2)}  ΔR ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
  );
}

console.log("\n== per side / session (full series) ==");
const groupBy = (rows, fn) => {
  const m = new Map();
  for (const r of rows) {
    const k = fn(r);
    const g = m.get(k) ?? { n: 0, R: 0 };
    g.n++;
    g.R += r.rMultiple ?? 0;
    m.set(k, g);
  }
  return m;
};
const candleSession = (() => {
  const idx = new Map();
  const rows = lines.slice(2);
  rows.forEach((l, i) => {
    const cells = l.split(",");
    idx.set(cells[0], cells[16] ?? "?");
  });
  return (r) => idx.get(r.datetime) ?? "?";
})();
for (const [fn, label] of [
  [(r) => r.side ?? "?", "side"],
  [candleSession, "session"],
]) {
  const a = groupBy(on, fn);
  const b = groupBy(off, fn);
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? { n: 0, R: 0 };
    const y = b.get(k) ?? { n: 0, R: 0 };
    const delta = x.R - y.R;
    console.log(
      `  ${label} ${String(k).padEnd(7)} F on ${String(x.n).padStart(4)}/${x.R.toFixed(1).padStart(7)}  F off ${String(y.n).padStart(4)}/${y.R.toFixed(1).padStart(7)}  ΔR ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
    );
  }
}
