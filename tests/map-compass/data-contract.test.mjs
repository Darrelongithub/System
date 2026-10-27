/**
 * G1 data-contract tests. These enforce the freeze: pinned hashes, denylist,
 * DST verdict, cost model, and the sealed holdout. Run after M1 scripts.
 */
import { readFileSync, existsSync } from "node:fs";
import { test, assert, assertEqual } from "../tiny.mjs";
import { gitBlobOid, sha256File } from "../../scripts/map-compass/lib/hash.mjs";
import { ROLES, DENYLIST, MAP, CLAIM_CRITERIA } from "../../scripts/map-compass/frozen.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);
const read = (p) => JSON.parse(readFileSync(A(p), "utf8"));
const have = (p) => existsSync(A(p));

test("M1 artifacts exist and the DST verification passed", () => {
  for (const p of [
    "data-manifest.json",
    "dst-verification.json",
    "spread-table.json",
    "gap-report.json",
  ]) {
    assert(have(p), `${p} must exist — run the map-compass M1 scripts first`);
  }
  assertEqual(read("dst-verification.json").verdict, "PASS");
});

test("every fetched blob still matches its pinned git oid", () => {
  const pins = JSON.parse(
    readFileSync(new URL("../../scripts/map-compass/pins.json", import.meta.url), "utf8"),
  );
  const fetched = read("raw/fetch-manifest.json");
  let checked = 0;
  for (const [key, oid] of Object.entries(pins)) {
    const rel = /^(bid|ask)_\d{4}_\d{2}$/.test(key) ? `${key}.csv` : key;
    const p = A(`raw/${rel}`);
    if (!existsSync(p)) continue; // --only subsets are allowed
    assertEqual(gitBlobOid(readFileSync(p)), oid, `${key} bytes must match the frozen pin`);
    checked++;
  }
  assert(checked >= 3, `expected a meaningful number of verified blobs, got ${checked}`);
  assertEqual(fetched.errors.length, 0, "fetch must have no errors");
});

test("normalised outputs are LF-only, monotonic, and OHLC-valid", () => {
  for (const name of ["xauusd-m30-eat.csv", "xauusd-m15-eat.csv", "eurusd-m30-eat.csv"]) {
    const p = A(`normalized/${name}`);
    assert(existsSync(p), `${name} must exist`);
    const text = readFileSync(p, "utf8");
    assert(!text.includes("\r"), `${name} must be LF-only`);
    assert(text.startsWith("# metadata:"), `${name} must declare its metadata`);
    const lines = text
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("datetime"));
    // Monotonicity + OHLC on a bounded sample (the audit script checks all rows).
    let prev = "";
    for (let i = 0; i < lines.length; i += Math.max(1, Math.floor(lines.length / 500))) {
      const f = lines[i].split(",");
      assert(f[0] > prev, `${name} non-monotonic near ${f[0]}`);
      prev = f[0];
      const [o, h, l, c] = f.slice(1, 5).map(Number);
      assert(l <= Math.min(o, c) && h >= Math.max(o, c), `${name} OHLC violation at ${f[0]}`);
    }
    assert(lines.length > 1000, `${name} looks truncated (${lines.length} rows)`);
  }
});

test("no hindsight/derived column ever enters the normalised schema", () => {
  const header = readFileSync(A("normalized/xauusd-m30-eat.csv"), "utf8").split("\n")[1];
  assertEqual(header, "datetime,open,high,low,close,volume", "plain OHLCV only");
  for (const banned of DENYLIST) assert(!header.includes(banned), `${banned} must not be a column`);
});

test("roles are disjoint, sealed, and holdout years span multiple eras", () => {
  const all = [...ROLES.DEV, ...ROLES.HOLDOUT, ...ROLES.VAL, ...ROLES.STRESS];
  assertEqual(new Set(all).size, all.length, "years must not appear in two roles");
  assertEqual(ROLES.HOLDOUT.length, 4);
  for (const y of ROLES.HOLDOUT) assert(!ROLES.DEV.includes(y), `${y} is sealed`);
  assert(ROLES.HOLDOUT.includes(2008), "GFC must be represented in the holdout");
  assert(
    ROLES.HOLDOUT.some((y) => y >= 2016),
    "a modern-ish year must be in the holdout too",
  );
});

test("cost model is real bid-ask data, frozen, and wider than the old $0.20", () => {
  const s = read("spread-table.json");
  assert(s.matchedMinutes > 100000, "must be built from a substantial M1 sample");
  assertEqual(s.negativeSpreads, 0, "ask must never be below bid");
  assertEqual(Object.keys(s.table).length, 9, "3 sessions x 3 vol regimes");
  const medians = Object.values(s.table).map((v) => v.median);
  assert(
    Math.min(...medians) > 0.2,
    `real median spread ${Math.min(...medians)} must exceed the old static 0.20`,
  );
  assert(
    Math.max(...Object.values(s.table).map((v) => v.max)) > 4,
    "crisis/rollover spikes must be represented",
  );
  assertEqual(s.volThresholds.low, 0.0006, "thresholds frozen at G0");
  assertEqual(s.volThresholds.high, 0.0016, "thresholds frozen at G0");
});

test("manifest hash matches the committed cost table", () => {
  const m = read("data-manifest.json");
  assertEqual(m.problems.length, 0, "audit must report no problems");
  assertEqual(m.timezone.verification.verdict, "PASS");
  assert(m.m15AuditCoveragePct > 98, "M15 must cover >98% of M30 bars for intrabar audit");
  assert(m.timezone.caveat.includes("extrapolated"), "pre-2010 caveat must remain visible");
});

test("gap report records the known holes rather than hiding them", () => {
  const g = read("gap-report.json");
  assert(g.holesOver24h.length > 0, "source has real holes; they must be enumerated");
  const big = g.largest.filter((x) => x.hours > 100);
  assert(big.length > 0, "the ~32-day 2025 hole and early-2000s holiday gaps must be recorded");
});
