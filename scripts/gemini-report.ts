/**
 * Phase-2 comparison report: regenerates the raw-vs-filtered evaluation from
 * ANY research audit file (offline, deterministic — no API calls).
 *
 *   npm run research:report -- output/gemini-research-XXXX.jsonl
 *
 * Prints the aggregate comparison plus per-strategy / session / weekday /
 * RR-band / HTF-alignment slices and writes <file>.report.json beside the
 * audit file. Only slices with n >= 20 selections are flagged meaningful.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  evaluateDeep,
  MEANINGFUL_N,
  type BucketMetrics,
  type DimensionName,
} from "@/lib/ai/evaluate";
import type { ResearchRecord } from "@/lib/ai/research";
import { loadGoldenTrades } from "../tests/fixtures.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: npm run research:report -- <audit.jsonl>");
  process.exit(1);
}

const records = readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as ResearchRecord);

const truth = loadGoldenTrades().map((t) => ({
  strategyId: t.strategyId,
  datetime: t.datetime,
  side: t.side ?? "-",
  outcome: t.outcome ?? "OPEN",
  rMultiple: t.rMultiple ?? null,
  rr: t.rr,
}));

const deep = evaluateDeep(records, truth);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtM = (m: {
  selected: number;
  tp: number;
  sl: number;
  winRate: number;
  avgR: number;
  profitFactor: number | null;
  totalR: number;
  maxDrawdownR: number;
}) =>
  `n=${String(m.selected).padStart(4)} TP/SL=${m.tp}/${m.sl} WR=${pct(m.winRate)} avgR=${m.avgR.toFixed(3)} PF=${m.profitFactor === null ? "∞" : m.profitFactor.toFixed(2)} R=${m.totalR.toFixed(2)} DD=${m.maxDrawdownR.toFixed(1)}`;

console.log(
  `=== aggregate (decided ${deep.decidedCoverage.decided}/${deep.decidedCoverage.candidates}, failures ${deep.decidedCoverage.failures}) ===`,
);
console.log(`raw deterministic : ${fmtM(deep.baseline.overall)}`);
console.log(
  `gemini filtered   : ${fmtM(deep.filtered.overall)}  (selection rate ${pct(deep.filtered.overall.selectionRate)})`,
);

const dims: DimensionName[] = ["strategy", "session", "weekday", "rrBand", "htfAlignment"];
for (const dim of dims) {
  console.log(`\n=== ${dim} (meaningful = n≥${MEANINGFUL_N} selected) ===`);
  const buckets = Object.entries(deep.filtered.buckets[dim]).sort((a, b) => b[1].n - a[1].n);
  if (buckets.length === 0) {
    console.log("  (no selections)");
    continue;
  }
  for (const [key, m] of buckets) {
    const base: BucketMetrics | undefined = deep.baseline.buckets[dim][key];
    console.log(
      `${m.meaningful ? "*" : " "} ${key.padEnd(20)} filtered: ${fmtM(m)}` +
        (base ? `   | baseline: WR=${pct(base.winRate)} avgR=${base.avgR.toFixed(3)}` : ""),
    );
  }
}

const out = file.replace(/\.jsonl$/, "") + ".report.json";
writeFileSync(out, JSON.stringify(deep, null, 2));
console.log(`\nreport written: ${out}`);
