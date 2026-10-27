/** M2 Map v0 instrument tests. */
import { readFileSync, existsSync } from "node:fs";
import { test, assert, assertEqual } from "../tiny.mjs";
import { MAP, ROLES, STATES } from "../../scripts/map-compass/frozen.mjs";
import {
  computeFeatures,
  classify,
  rawStateOf,
  buildMap,
} from "../../scripts/map-compass/lib/map.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);
const report = existsSync(A("map-validation.json"))
  ? JSON.parse(readFileSync(A("map-validation.json"), "utf8"))
  : null;

function synth(n = 1200, fn = (i) => 100 + Math.sin(i / 7) * 2) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const c = fn(i);
    bars.push({
      datetime: `2020-01-${String(1 + Math.floor(i / 48)).padStart(2, "0")} ${String(((i % 48) / 2) | 0).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00`,
      o: c - 0.2,
      h: c + 1,
      l: c - 1,
      c,
      v: 1,
    });
  }
  return bars;
}

test("G0 thresholds are unchanged (freeze guard)", () => {
  assertEqual(MAP.erCutoff, 0.35);
  assertEqual(MAP.atrPctileCutoff, 70);
  assertEqual(MAP.atrPctileLookback, 500);
  assertEqual(MAP.hysteresisBars, 3);
  assertEqual(MAP.abstainBandPct, 10);
  assertEqual(STATES.length, 4);
});

test("raw state mapping is the 2x2 hand-defined grid", () => {
  const f = (er, pctile) => ({ warmup: false, er, atrPctile: pctile });
  assertEqual(rawStateOf(f(0.6, 90)), "EXPANSION");
  assertEqual(rawStateOf(f(0.6, 20)), "GRIND");
  assertEqual(rawStateOf(f(0.1, 90)), "WHIPSAW");
  assertEqual(rawStateOf(f(0.1, 20)), "QUIET");
  assertEqual(rawStateOf(f(0.35, 90)), "UNKNOWN", "ER at cutoff abstains");
  assertEqual(rawStateOf(f(0.6, 70)), "UNKNOWN", "pctile at cutoff abstains");
});

test("features are causal: future bars cannot change a past feature", () => {
  const a = synth(1400);
  const b = a.map((x, i) =>
    i > 1300 ? { ...x, o: x.c * 4, h: x.c * 4.1, l: x.c * 3.9, c: x.c * 4 } : x,
  );
  const fa = computeFeatures(a),
    fb = computeFeatures(b);
  for (let i = 1000; i <= 1300; i++) {
    assertEqual(fa[i].er, fb[i].er, `er at ${i}`);
    assertEqual(fa[i].atrPctile, fb[i].atrPctile, `atrPctile at ${i}`);
    assertEqual(fa[i].rangePos, fb[i].rangePos, `rangePos at ${i}`);
  }
});

test("features are scale-free: multiplying all prices by 17 leaves states unchanged", () => {
  const a = synth(1400);
  const b = a.map((x) => ({ ...x, o: x.o * 17, h: x.h * 17, l: x.l * 17, c: x.c * 17 }));
  const sa = classify(computeFeatures(a)),
    sb = classify(computeFeatures(b));
  for (let i = 1050; i < a.length; i++) assertEqual(sa[i].state, sb[i].state, `state at ${i}`);
});

test("hysteresis needs exactly 3 consecutive bars (and records the lag)", () => {
  const features = [];
  for (let i = 0; i < 12; i++) {
    // alternate QUIET -> EXPANSION, avoiding the abstain band
    const exp = i >= 4 && i <= 8;
    features.push({ warmup: false, er: exp ? 0.8 : 0.1, atrPctile: exp ? 90 : 20 });
  }
  const st = classify(features);
  assertEqual(st[3].state, "QUIET");
  assertEqual(st[4].reason, "pending_transition");
  assertEqual(st[5].reason, "pending_transition");
  assertEqual(st[6].state, "EXPANSION", "3rd consecutive bar confirms");
  assertEqual(st[6].barsSinceStateChange, 0);
  assertEqual(st[8].barsSinceStateChange, 2);
});

test("UNKNOWN abstain bars are flat but retain the confirmed state as context", () => {
  const features = [];
  for (let i = 0; i < 14; i++) {
    let er = 0.1,
      pct = 20;
    if (i >= 4 && i <= 6) {
      er = 0.8;
      pct = 90;
    }
    if (i === 8) er = 0.35; // abstain band
    features.push({ warmup: false, er, atrPctile: pct });
  }
  const st = classify(features);
  assertEqual(st[8].state, "UNKNOWN");
  assertEqual(st[9].state, "EXPANSION", "confirmed state resumes after abstain");
});

test("no series is evaluated below the 1000-bar warm-up floor", () => {
  const f = computeFeatures(synth(1400));
  for (let i = 0; i < MAP.warmupBars; i++) assert(f[i].warmup, `bar ${i} must be warmup`);
  assert(!f[MAP.warmupBars + 10].warmup || Number.isFinite(f[MAP.warmupBars + 10].atrPctile));
});

test("M2 instrument report: causality, determinism, coverage all pass", () => {
  assert(report, "run node scripts/map-compass/build-map.mjs first");
  assertEqual(report.verdict, "PASS");
  assertEqual(report.causality.futureMutationMismatch, 0);
  assertEqual(report.causality.truncationMismatch, 0);
  assertEqual(report.determinism, true);
  assertEqual(report.coverageProblems.length, 0);
  assertEqual(report.devYearsOnly, true, "holdout years must be sealed");
  for (const y of ROLES.HOLDOUT)
    assert(!report.coverage[y], `holdout year ${y} must not appear in coverage`);
});

test("sweep is a DIAGNOSTIC at M2, never a threshold selector", () => {
  assert(report);
  assertEqual(report.sensitivitySweep.vetoAtM2, false);
  assertEqual(report.thresholds.erCutoff, 0.35, "sweep must not move the frozen threshold");
  assertEqual(report.thresholds.atrPctileCutoff, 70);
  assert(report.warnings.length >= 2, "flat-bar rate and dwell caveat must be recorded");
});

test("regime episodes persist longer than raw routing dwell", () => {
  assert(report);
  for (const s of STATES) {
    assert(
      report.episodeDwell[s].medianBars > report.dwell[s].medianBars,
      `${s}: episode dwell must exceed routing dwell (else UNKNOWN is not the cause of flicker)`,
    );
  }
  assert(report.flatBarPct > 0 && report.flatBarPct < 40, "flat rate must be reported and bounded");
});

test("lag accounting is populated for M9 stratification", () => {
  assert(report);
  const total = Object.values(report.lag.buckets).reduce((a, b) => a + b, 0);
  assert(total > 1000, "lag buckets must have real counts");
  assert(report.lag.buckets["7+"] > 0, "some trades must be well past confirmation");
});
