#!/usr/bin/env node
/**
 * M1 — normalise the fetched raw files into canonical, LF, EAT-wall-clock OHLCV.
 *
 * Decisions locked at G1 (docs/MAP-COMPASS-DATA-CONTRACT.md):
 *  - XAU M30 + M15: broker-local EU-DST -> fixed EAT via brokerLocalToEat().
 *  - EURUSD M30: fixed DST-free clock (assumed UTC) -> EAT by +3h; prices /1e5.
 *  - Vendor 1h/4h/1d/1Month are NOT kept: derived+gap-checked in audit-data.mjs.
 *  - Output is plain OHLCV. NO enriched/hindsight columns are carried. The Map
 *    computes its own causal features from these bars (M2).
 *
 * Every output carries a `# metadata:` line declaring timezone, price side and
 * source hashes, so no one can feed it in without knowing what it is.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num, toCsv } from "./lib/csv.mjs";
import { brokerLocalToEat, parseNaive, formatNaive } from "./lib/dst.mjs";
import { sha256 } from "./lib/hash.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RAW = join(ROOT, "artifacts/map-compass/raw");
const OUT = join(ROOT, "artifacts/map-compass/normalized");
const HEADER = ["datetime", "open", "high", "low", "close", "volume"];

mkdirSync(OUT, { recursive: true });

function extractArchive() {
  const zip = join(RAW, "archive.zip");
  const dir = join(RAW, "kaggle");
  if (!existsSync(join(dir, "XAU_30m_data.csv"))) {
    mkdirSync(dir, { recursive: true });
    execFileSync("unzip", ["-q", "-o", zip, "-d", dir], { stdio: "pipe" });
  }
  return dir;
}

function normKaggle(path, scale) {
  const rows = [];
  let bad = 0;
  for (const f of dataLines(readFileSync(path, "utf8"), { delimiter: ";" })) {
    if (f.length < 6) {
      bad++;
      continue;
    }
    const dt = brokerLocalToEat(f[0]);
    const o = num(f[1]),
      h = num(f[2]),
      l = num(f[3]),
      c = num(f[4]),
      v = num(f[5]);
    if (!dt || o === undefined || h === undefined || l === undefined || c === undefined) {
      bad++;
      continue;
    }
    if (!(l <= Math.min(o, c) && h >= Math.max(o, c) && o > 0)) {
      bad++;
      continue;
    }
    rows.push([dt, o / scale, h / scale, l / scale, c / scale, v ?? 0]);
  }
  return { rows, bad };
}

function normEurusd(path) {
  const rows = [];
  let bad = 0;
  for (const f of dataLines(readFileSync(path, "utf8"), { delimiter: "," })) {
    if (f.length < 5) {
      bad++;
      continue;
    }
    const naive = parseNaive(f[0]);
    const o = num(f[1]),
      h = num(f[2]),
      l = num(f[3]),
      c = num(f[4]);
    if (
      naive === undefined ||
      o === undefined ||
      h === undefined ||
      l === undefined ||
      c === undefined
    ) {
      bad++;
      continue;
    }
    // Fixed clock, no DST. Assume UTC; +3h -> EAT. Documented as an assumption.
    const dt = formatNaive(naive + 3 * 60 * 60 * 1000);
    const s = 1e5;
    if (!(l <= Math.min(o, c) && h >= Math.max(o, c))) {
      bad++;
      continue;
    }
    rows.push([dt, o / s, h / s, l / s, c / s, num(f[5]) ?? 0]);
  }
  return { rows, bad };
}

function write(name, rows, meta) {
  const body = toCsv(HEADER, rows);
  const text = `# metadata: ${JSON.stringify(meta)}\n` + body;
  writeFileSync(join(OUT, name), text);
  return {
    file: name,
    bars: rows.length,
    first: rows[0][0],
    last: rows[rows.length - 1][0],
    sha256: sha256(Buffer.from(text)),
  };
}

const dir = extractArchive();
const results = [];
const problems = [];

for (const [src, out, kind] of [
  ["XAU_30m_data.csv", "xauusd-m30-eat.csv", "xau-m30"],
  ["XAU_15m_data.csv", "xauusd-m15-eat.csv", "xau-m15"],
]) {
  const { rows, bad } = normKaggle(join(dir, src), 1);
  if (bad) problems.push(`${src}: ${bad} rejected rows`);
  const meta = {
    instrument: "XAUUSD",
    timeframe: kind,
    timezone: "EAT (fixed UTC+3)",
    price_side: "bid (verified vs Dukascopy M1)",
    volume: "tick volume",
    source: "kaggle/novandraanugrah/xauusd-gold-price-historical-data-2004-2024",
    conversion: "broker EU-DST local -> fixed EAT",
    source_oid: JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"))[
      "archive.zip"
    ],
  };
  results.push(write(out, rows, meta));
}

{
  const { rows, bad } = normEurusd(join(RAW, "EURUSDm30.csv"));
  if (bad) problems.push(`EURUSDm30.csv: ${bad} rejected rows`);
  const meta = {
    instrument: "EURUSD",
    timeframe: "m30",
    timezone: "EAT (fixed UTC+3), from assumed UTC",
    price_side: "single OHLC (unspecified)",
    volume: "tick volume",
    source: "github/ejtraderLabs/historical-data",
    conversion: "fixed clock +3h; prices /1e5",
    caveat: "Timezone/provider unverified. Diagnostic use only (M9), never a VAL gate.",
  };
  results.push(write("eurusd-m30-eat.csv", rows, meta));
}

const report = {
  generatedAt: new Date().toISOString(),
  outputs: results,
  problems,
  note: "1h/4h/1d/1Month deliberately not normalised: derived from M30 by the engine; gap-checked in audit-data.mjs",
};
writeFileSync(join(OUT, "normalize-report.json"), JSON.stringify(report, null, 2) + "\n");
for (const r of results)
  console.log(`${r.file.padEnd(24)} ${String(r.bars).padStart(7)} bars  ${r.first} -> ${r.last}`);
if (problems.length) {
  console.error("PROBLEMS:", problems.join("; "));
  process.exit(1);
}
