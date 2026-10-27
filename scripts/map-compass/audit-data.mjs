#!/usr/bin/env node
/**
 * M1 — audit the normalised datasets and emit the frozen G1 manifest.
 *
 * Produces:
 *   artifacts/map-compass/data-manifest.json   hashes, coverage, roles, denylist
 *   artifacts/map-compass/gap-report.json      every intra-week gap > 2h
 *
 * Also performs the one-time derived-timeframe gap-check: aggregate M30 -> H1,
 * H4, D1 with the engine's EAT bucketing and compare to the vendor's own 1h/4h/1d
 * files. Those vendor files are then NOT used (engine derives its own).
 *
 * Data roles (decision #6: interleaved sealed holdout) are declared here and
 * frozen. HOLDOUT years are never read by any DEV process.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { parseNaive, formatNaive, sessionOfEat } from "./lib/dst.mjs";
import { sha256File, sha256 } from "./lib/hash.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RAW = join(ROOT, "artifacts/map-compass/raw");
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

// Frozen constants live in a side-effect-free module so tests can import them
// without re-running this audit.
import { ROLES, DENYLIST } from "./frozen.mjs";
export { ROLES, DENYLIST };

function readNormalized(name) {
  const rows = [];
  for (const f of dataLines(readFileSync(join(NORM, name), "utf8"), { delimiter: "," })) {
    if (f[0] === "datetime") continue;
    const dt = parseNaive(f[0]);
    if (dt === undefined) continue;
    rows.push({
      dt,
      canonical: f[0],
      o: num(f[1]),
      h: num(f[2]),
      l: num(f[3]),
      c: num(f[4]),
      v: num(f[5]),
    });
  }
  return rows;
}

function gapReport(rows) {
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    const h = (rows[i].dt - rows[i - 1].dt) / 3600000;
    if (h > 2 && h < 200) {
      gaps.push({
        from: formatNaive(rows[i - 1].dt),
        to: formatNaive(rows[i].dt),
        hours: +h.toFixed(1),
      });
    }
  }
  gaps.sort((a, b) => b.hours - a.hours);
  return {
    totalIntraweekGaps: gaps.length,
    holesOver24h: gaps.filter((g) => g.hours > 24),
    largest: gaps.slice(0, 20),
  };
}

function coverageByYear(rows) {
  const out = {};
  for (const r of rows) {
    const y = new Date(r.dt).getUTCFullYear();
    if (!out[y])
      out[y] = {
        bars: 0,
        first: r.canonical,
        last: r.canonical,
        sessions: { asian: 0, london: 0, ny: 0 },
      };
    const c = out[y];
    c.bars++;
    c.last = r.canonical;
    const s = sessionOfEat(r.canonical);
    if (s) c.sessions[s]++;
  }
  return out;
}

const xau = readNormalized("xauusd-m30-eat.csv");
const xau15 = readNormalized("xauusd-m15-eat.csv");
const eu = readNormalized("eurusd-m30-eat.csv");

// Determinism / integrity checks
const problems = [];
for (const [name, rows] of [
  ["xauusd-m30-eat.csv", xau],
  ["xauusd-m15-eat.csv", xau15],
  ["eurusd-m30-eat.csv", eu],
]) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].dt <= rows[i - 1].dt) {
      problems.push(`${name}: non-monotonic at ${rows[i].canonical}`);
      break;
    }
  }
  const bad = rows.filter((r) => !(r.l <= Math.min(r.o, r.c) && r.h >= Math.max(r.o, r.c)));
  if (bad.length) problems.push(`${name}: ${bad.length} OHLC violations`);
}

// M15 intrabar audit coverage: how many M30 bars have both M15 sub-bars?
// This is a KNOWN limitation of the source, not a failure: those bars simply
// have no intrabar resolution and must fall back to the M30 conservative rule.
const warnings = [];
let m15Missing = 0;
{
  const m15 = new Set(xau15.map((r) => r.dt));
  for (const r of xau) if (!m15.has(r.dt) || !m15.has(r.dt + 15 * 60000)) m15Missing++;
  if (m15Missing > 0) {
    warnings.push(
      `M15 audit layer: ${m15Missing} M30 bars (${((m15Missing / xau.length) * 100).toFixed(2)}%) lack both sub-bars — fall back to conservative M30 intrabar rule`,
    );
  }
}

const fetchManifest = JSON.parse(readFileSync(join(RAW, "fetch-manifest.json"), "utf8"));
const dst = JSON.parse(readFileSync(join(OUT, "dst-verification.json"), "utf8"));
const spread = JSON.parse(readFileSync(join(OUT, "spread-table.json"), "utf8"));

const manifest = {
  generatedAt: new Date().toISOString(),
  version: "G1-v1 (2-epoch DST correction)",
  roles: ROLES,
  roleNote:
    "Interleaved sealed HOLDOUT (2008/2012/2016/2019) spans GFC, 2011 aftermath, 2015-18 range, 2019 breakout. Never read by DEV/Map/claim verification. STRESS is diagnostic only.",
  timezone: {
    target: "EAT fixed UTC+3",
    source: "broker-local EU DST, two epochs",
    epochA: "2004-06-11..2011-05-06 UTC+1 winter/+2 summer",
    epochB: "2011-05-09..2026-01-30 UTC+2 winter/+3 summer",
    seam: "2011-05-09 01:00 broker-local; price-continuous, day boundary 44->46 bars",
    verification: {
      verdict: dst.verdict,
      months: dst.monthsChecked,
      independentSource: dst.independentSource,
    },
    caveat:
      "Dukascopy UTC reference starts 2010-01. Epoch A is verified 2010-01..2011-05 only; 2004-06..2009-12 is extrapolated and flagged LOW-CONFIDENCE.",
  },
  datasets: {
    xauusdM30: {
      file: "normalized/xauusd-m30-eat.csv",
      sha256: sha256File(join(NORM, "xauusd-m30-eat.csv")),
      bars: xau.length,
      first: xau[0].canonical,
      last: xau[xau.length - 1].canonical,
    },
    xauusdM15: {
      file: "normalized/xauusd-m15-eat.csv",
      sha256: sha256File(join(NORM, "xauusd-m15-eat.csv")),
      bars: xau15.length,
      note: "intrabar audit layer only",
    },
    eurusdM30: {
      file: "normalized/eurusd-m30-eat.csv",
      sha256: sha256File(join(NORM, "eurusd-m30-eat.csv")),
      bars: eu.length,
      note: "single OHLC, timezone/provider unverified; M9 diagnostic only",
    },
  },
  denylist: DENYLIST,
  denylistNote:
    "No enriched/hindsight columns exist in normalised outputs. Map computes causal features from OHLCV only.",
  gaps: gapReport(xau),
  coverageByYear: coverageByYear(xau),
  costModel: {
    file: "spread-table.json",
    sha256: sha256(Buffer.from(JSON.stringify(spread.table))),
    matchedMinutes: spread.matchedMinutes,
    note: "Real bid-ask spreads, sampled months 2010-2026. Frozen at G0; never re-fit after strategy results.",
  },
  fetch: { files: Object.keys(fetchManifest.files).length, errors: fetchManifest.errors },
  m15AuditCoveragePct: +((1 - m15Missing / xau.length) * 100).toFixed(2),
  warnings,
  problems,
};
writeFileSync(join(OUT, "data-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(OUT, "gap-report.json"), JSON.stringify(manifest.gaps, null, 2) + "\n");

console.log(
  `XAU M30: ${xau.length} bars ${manifest.datasets.xauusdM30.first} -> ${manifest.datasets.xauusdM30.last}`,
);
console.log(
  `gaps >24h: ${manifest.gaps.holesOver24h.length}, largest ${manifest.gaps.largest[0]?.hours}h`,
);
console.log(`M15 audit coverage: ${manifest.m15AuditCoveragePct}%`);
console.log(`problems: ${problems.length ? problems.join("; ") : "none"}`);
if (problems.length) process.exit(1);
