#!/usr/bin/env node
/**
 * M1 / G1 sign-off — verify the timezone conversion against INDEPENDENT
 * Dukascopy M1 BID in UTC (a different provider from the Kaggle file).
 *
 * Three candidate rules are scored over every sampled month:
 *   TWO_EPOCH : shipped rule in lib/dst.mjs (UTC+1/+2 then UTC+2/+3, EU DST)
 *   ONE_EPOCH : EU DST, UTC+2/+3 throughout (what you'd assume from 2020 data)
 *   NO_DST    : treat broker-local as fixed EAT (what the old pipeline did)
 *
 * For each rule, each Kaggle M30 bar is placed at UTC = EAT - 3h and its close
 * is compared to the last Dukascopy M1 bid close in that UTC 30m bucket.
 * Median absolute close error per month is the score (lower = better).
 *
 * PASS requires, over >=8 usable months with >=4 winter months:
 *   - TWO_EPOCH median error < 0.75 in EVERY month,
 *   - TWO_EPOCH strictly better than NO_DST in every winter month,
 *   - TWO_EPOCH strictly better than ONE_EPOCH in every pre-seam month,
 *   - TWO_EPOCH equal to ONE_EPOCH in every post-seam month.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import {
  isEuSummerDate,
  parseNaive,
  formatNaive,
  brokerLocalToEat,
  epochOf,
  EPOCH_B_START,
  VERIFIED_FROM,
} from "./lib/dst.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RAW = join(ROOT, "artifacts/map-compass/raw");
const OUT = join(ROOT, "artifacts/map-compass");
const PINS = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const MONTHS = Object.keys(PINS)
  .filter((k) => /^bid_\d{4}_\d{2}$/.test(k))
  .map((k) => k.slice(4))
  .sort();
const H3 = 3 * 3600000;

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** Independent truth: UTC epoch ms -> 30m bucket -> last M1 bid close. */
function aggM1(path) {
  const buckets = new Map();
  for (const f of dataLines(readFileSync(path, "utf8"), { delimiter: "," })) {
    if (f[0] === "timestamp") continue;
    const ts = Number(f[0]);
    const c = num(f[4]);
    if (!Number.isFinite(ts) || c === undefined) continue;
    buckets.set(Math.floor(ts / 1800000) * 1800000, c);
  }
  return buckets;
}

const rawRows = [];
for (const f of dataLines(readFileSync(join(RAW, "kaggle/XAU_30m_data.csv"), "utf8"), {
  delimiter: ";",
})) {
  if (f[0] === "Date") continue;
  const c = num(f[4]);
  if (c !== undefined && parseNaive(f[0]) !== undefined) rawRows.push([f[0], c]);
}

function oneEpoch(t) {
  const n = parseNaive(t);
  const d = new Date(n);
  const summer = isEuSummerDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return formatNaive(n + (summer ? 0 : 1) * 3600000);
}
const noDst = (t) => formatNaive(parseNaive(t));

const RULES = { TWO_EPOCH: brokerLocalToEat, ONE_EPOCH: oneEpoch, NO_DST: noDst };

function score(rule, buckets, y, m) {
  const errs = [];
  for (const [text, close] of rawRows) {
    const n = parseNaive(text);
    const d = new Date(n);
    if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m) continue;
    const canon = rule(text);
    const eatMs = parseNaive(canon);
    if (eatMs === undefined) continue;
    const expected = buckets.get(eatMs - H3);
    if (expected === undefined) continue;
    errs.push(Math.abs(close - expected));
  }
  return errs.length ? median(errs) : NaN;
}

const results = [];
for (const mo of MONTHS) {
  const p = join(RAW, `bid_${mo}.csv`);
  if (!existsSync(p)) {
    results.push({ month: mo, error: "missing bid file" });
    continue;
  }
  const buckets = aggM1(p);
  const [y, m] = mo.split("_").map(Number);
  const scores = Object.fromEntries(
    Object.entries(RULES).map(([name, rule]) => [name, score(rule, buckets, y, m)]),
  );
  // A month straddling the epoch boundary contains bars from BOTH epochs. It
  // cannot satisfy "identical to ONE_EPOCH" by construction; exclude it from
  // that equality test but still require low error.
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01 00:00:00`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-31 23:59:59`;
  const straddles = epochOf(monthStart) === "A" && epochOf(monthEnd) === "B";
  results.push({
    month: mo,
    season: isEuSummerDate(y, m, 15) ? "summer" : "winter",
    epoch: straddles ? "A+B" : epochOf(`${y}-${String(m).padStart(2, "0")}-15 12:00:00`),
    straddles,
    ...Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, +v.toFixed(4)])),
  });
}

const usable = results.filter((r) => Number.isFinite(r.TWO_EPOCH));
const winters = usable.filter((r) => r.season === "winter" && !r.straddles);
const preSeam = usable.filter((r) => r.epoch === "A");
const postSeam = usable.filter((r) => r.epoch === "B");
const bad = usable.filter((r) => r.TWO_EPOCH >= 0.75);
const winterBad = winters.filter((r) => !(r.TWO_EPOCH < r.NO_DST));
const preBad = preSeam.filter((r) => !(r.TWO_EPOCH < r.ONE_EPOCH));
const postBad = postSeam.filter((r) => Math.abs(r.TWO_EPOCH - r.ONE_EPOCH) > 0.02);

const report = {
  generatedAt: new Date().toISOString(),
  shippedRule: "two epochs: A UTC+1/+2 (pre 2011-05-09), B UTC+2/+3; both EU DST; target fixed EAT",
  independentSource: "Dukascopy M1 BID via kevingtlin/Market-Data-Lab (UTC, pinned git blob oids)",
  coverage: {
    from: VERIFIED_FROM,
    note: "2004-06..2009-12 has no independent UTC reference; epoch A is extrapolated there",
  },
  epochBoundary: EPOCH_B_START,
  monthsChecked: usable.length,
  winterMonths: winters.length,
  preSeamMonths: preSeam.length,
  postSeamMonths: postSeam.length,
  badErrors: bad.map((r) => r.month),
  winterNotBetterThanNoDst: winterBad.map((r) => r.month),
  preSeamNotBetterThanOneEpoch: preBad.map((r) => r.month),
  postSeamDisagreesWithOneEpoch: postBad.map((r) => r.month),
  verdict:
    usable.length >= 8 &&
    winters.length >= 4 &&
    preSeam.length >= 2 &&
    postSeam.length >= 4 &&
    !bad.length &&
    !winterBad.length &&
    !preBad.length &&
    !postBad.length
      ? "PASS"
      : "FAIL",
  results,
};
writeFileSync(join(OUT, "dst-verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log("month     season  epoch |  TWO_EPOCH  ONE_EPOCH     NO_DST");
for (const r of results) {
  console.log(
    `${r.month}  ${r.season.padEnd(7)} ${r.epoch}     |  ${String(r.TWO_EPOCH).padStart(8)}  ${String(r.ONE_EPOCH).padStart(9)}  ${String(r.NO_DST).padStart(10)}`,
  );
}
console.log(
  `\nVERDICT: ${report.verdict}  (${usable.length} months, ${winters.length} winter, ${preSeam.length} pre-seam)`,
);
if (report.verdict !== "PASS") process.exit(1);
