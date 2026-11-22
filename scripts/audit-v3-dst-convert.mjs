#!/usr/bin/env node
/**
 * Stage 2 (DST-correct freeze) — convert the broker-local 2004–2019 unseen
 * archive to fixed EAT (UTC+3) wall-clock timestamps.
 *
 * Rule (verified against INDEPENDENT Dukascopy M1 in the Map/Compass audit,
 * 44 sampled months 2010→2026, verdict PASS — see docs/MAP-COMPASS-DATA-CONTRACT.md):
 *   EPOCH A  2004-06-11 .. 2011-05-06  broker = UTC+1 winter / UTC+2 summer
 *               EAT = broker_local + 2h (EU winter) / + 1h (EU summer)
 *   EPOCH B  2011-05-09 .. 2026-01-30  broker = UTC+2 winter / UTC+3 summer
 *               EAT = broker_local + 1h (EU winter) / + 0h (EU summer)
 * EU DST boundary (exact, date-based): EU summer = [last Sunday of March 01:00 UTC,
 * last Sunday of October 01:00 UTC).
 *
 * Coverage caveats: epoch A is VERIFIED only for 2010-01..2011-05 (Dukascopy
 * coverage starts 2010-01); 2004-06..2009-12 is EXTRAPOLATED and flagged.
 *
 * Usage: node scripts/audit-v3-dst-convert.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SRC = "artifacts/v3-skeptic-audit/data/unseen-2004-2019.csv";
const DST_OUT = "artifacts/rc-test/unseen-2004-2019-eat-twoepoch.csv";

const HOUR_MS = 60 * 60 * 1000;
const EPOCH_B_START = "2011-05-09 01:00:00";
const EPOCH_B_START_MS = Date.UTC(2011, 4, 9, 1, 0, 0);

function parseNaive(text) {
  const m = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  const check = new Date(ms);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d || check.getUTCHours() !== +h || check.getUTCMinutes() !== +mi) return undefined;
  return ms;
}
function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month, 0));
  return Date.UTC(year, month - 1, last.getUTCDate() - ((last.getUTCDay() + 7) % 7));
}
function isEuSummerDate(year, month, day) {
  const dateMs = Date.UTC(year, month - 1, day);
  const start = lastSunday(year, 3) + HOUR_MS;   // Mar last Sunday 01:00 UTC
  const end = lastSunday(year, 10) + HOUR_MS;    // Oct last Sunday 01:00 UTC
  return dateMs >= start && dateMs < end;
}
function formatNaive(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function brokerLocalToEat(text) {
  const naive = parseNaive(text);
  if (naive === undefined) return undefined;
  const d = new Date(naive);
  const summer = isEuSummerDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const hours = naive < EPOCH_B_START_MS ? (summer ? 1 : 2) : (summer ? 0 : 1);
  return formatNaive(naive + hours * HOUR_MS);
}

const raw = readFileSync(SRC, "utf8");
const lines = raw.split(/\r?\n/);
const meta = lines[0];
const header = lines[1];
const body = lines.slice(2).filter((l) => l.trim() !== "");

const perMonth = new Map(); // month -> { n, epochMix:Set, summer:Set }
const out = [];
let prev = undefined;
let duplicates = 0;
let nonMonotone = 0;
let badTime = 0;
for (const line of body) {
  const cells = line.split(",");
  const dt = cells[0].trim();
  const converted = brokerLocalToEat(dt);
  if (converted === undefined) { badTime++; continue; }
  if (prev !== undefined && converted <= prev) nonMonotone++;
  prev = converted;
  out.push([converted, ...cells.slice(1)].join(","));
  const month = dt.slice(0, 7);
  const e = perMonth.get(month) ?? { n: 0, summers: 0, winters: 0, preEPOCHB: 0 };
  e.n++;
  const ms = parseNaive(dt);
  const d = new Date(ms);
  const summer = isEuSummerDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  if (summer) e.summers++; else e.winters++;
  if (ms < EPOCH_B_START_MS) e.preEPOCHB++;
  perMonth.set(month, e);
}

// Duplicate check after conversion
const seen = new Set();
for (const line of out) {
  const dt = line.split(",")[0];
  if (seen.has(dt)) duplicates++;
  seen.add(dt);
}

const text = [meta, header, ...out].join("\n") + "\n";
writeFileSync(DST_OUT, text, "utf8");
const sha = createHash("sha256").update(text, "utf8").digest("hex");

console.log("=== Stage 2 conversion ===");
console.log("source rows:", body.length);
console.log("converted rows:", out.length);
console.log("non-monotone rows:", nonMonotone);
console.log("duplicates after conversion:", duplicates);
console.log("bad timestamps:", badTime);
console.log("first:", out[0]?.split(",")[0], " last:", out[out.length - 1]?.split(",")[0]);
console.log("sha256:", sha);
console.log("\nper-month (broker-local era): n / winter / summer / pre-2011-05-09");
for (const [m, e] of [...perMonth.entries()].sort()) {
  console.log(`  ${m}: ${e.n}  winter=${e.winters} summer=${e.summers} preB=${e.preEPOCHB}`);
}
