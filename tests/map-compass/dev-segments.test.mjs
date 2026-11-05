/** G0 Amendment 8 Stage 2 segment isolation and causal Map/signal tests. */
import { test, assert, assertEqual } from "../tiny.mjs";
import { MAP, ROLES } from "../../scripts/map-compass/frozen.mjs";
import { buildMap, computeFeatures, classify } from "../../scripts/map-compass/lib/map.mjs";
import { emitSignals } from "../../scripts/map-compass/lib/signals.mjs";
import { mapSegment, splitDevSegments, eligibleEntryRange, m15MapForSegment } from "../../scripts/map-compass/lib/dev-segments.mjs";
import { buildDevPipeline } from "../../scripts/map-compass/lib/dev-pipeline.mjs";
import { formatNaive, parseNaive } from "../../scripts/map-compass/lib/dst.mjs";

function syntheticBars(n, start = "2004-01-01 00:00:00", phase = 0) {
  const t0 = parseNaive(start);
  return Array.from({ length: n }, (_, i) => {
    const c = 2000 + 0.002 * i + 2.5 * Math.sin((i + phase) / 7) + 0.9 * Math.sin((i + phase) / 2.3);
    const o = c - 0.25 * Math.sin((i + phase) / 3);
    const r = 0.8 + 0.3 * (1 + Math.sin((i + phase) / 11));
    return { datetime: formatNaive(t0 + 30 * i * 60_000), o, h: Math.max(o, c) + r, l: Math.min(o, c) - r, c, v: 1 };
  });
}

test("A8 segment Map equals continuous Map after warm-up when there are no gaps", () => {
  const bars = syntheticBars(1450);
  const continuous = buildMap(bars, MAP);
  const seg = mapSegment({ id: "one", bars }, MAP);
  const start = MAP.warmupBars;
  for (let i = start; i < bars.length - 96; i++) {
    assertEqual(seg.states[i].state, continuous.states[i].state, `state ${i}`);
    assertEqual(seg.features[i].er, continuous.features[i].er, `ER ${i}`);
    assertEqual(seg.features[i].atrPctile, continuous.features[i].atrPctile, `ATR percentile ${i}`);
  }
});

test("A8 split excludes non-DEV hole sentinel from Map, signal, M15 and trade components", () => {
  const first = syntheticBars(12, "2004-01-01 00:00:00");
  const last = syntheticBars(12, "2009-01-01 00:00:00", 5);
  const sentinel = new Proxy({ datetime: "2008-06-01 00:00:00" }, {
    get(target, key) {
      if (["o", "h", "l", "c", "v", "open", "high", "low", "close", "volume"].includes(String(key))) throw new Error(`hole sentinel OHLCV read: ${String(key)}`);
      return target[key];
    },
  });
  const feed = [...first, sentinel, ...last];
  const segments = splitDevSegments(feed);
  assertEqual(segments.length, 2);
  assertEqual(segments[0].id, "2004-2004");
  assertEqual(segments[1].id, "2009-2009");
  for (const s of segments) {
    const mapped = mapSegment(s);
    assertEqual(mapped.bars.length, 12);
  }
  const m15 = m15MapForSegment(segments[0].bars, [sentinel]);
  assertEqual(m15.size, 0);
  const pipeline = buildDevPipeline({ segments, m15Bars: [sentinel], entriesPerRandomGroup: 1 });
  assertEqual(pipeline.centerTrades.length, 0);
  assertEqual(pipeline.randomTrades.length, 0);
  assert(pipeline.diagnostics.noNonDevYearEntries);
});

test("A8 eligibility applies exactly 1,000 warm-up bars and 96 same-segment tail bars", () => {
  const r = eligibleEntryRange(1300);
  assertEqual(r.start, 1000);
  assertEqual(r.endExclusive, 1204);
  assertEqual(r.count, 204);
  assertEqual(eligibleEntryRange(1096).count, 0);
  assert(ROLES.DEV.includes(2004));
});

test("A8 segment features and signals are causal under future mutation", () => {
  const bars = syntheticBars(1500);
  const mutated = bars.map((b, i) => i > 1250 ? { ...b, o: b.o * 2, h: b.h * 2, l: b.l * 2, c: b.c * 2 } : { ...b });
  const aMap = buildMap(bars, MAP);
  const bMap = buildMap(mutated, MAP);
  const prefix = 1250;
  for (let i = 1000; i <= prefix; i++) {
    assertEqual(aMap.features[i].er, bMap.features[i].er, `ER ${i}`);
    assertEqual(aMap.features[i].atrPctile, bMap.features[i].atrPctile, `ATR percentile ${i}`);
    assertEqual(aMap.states[i].state, bMap.states[i].state, `state ${i}`);
  }
  for (const card of ["donchian-20", "atr-squeeze-break"]) {
    const a = emitSignals(bars, card).filter((s) => s.index <= prefix).map((s) => [s.index, s.side]);
    const b = emitSignals(mutated, card).filter((s) => s.index <= prefix).map((s) => [s.index, s.side]);
    assertEqual(JSON.stringify(a), JSON.stringify(b), `${card} must be causal through ${prefix}`);
  }
});

// Keep imports referenced for lint / explicit freeze visibility.
assertEqual(classify(computeFeatures(syntheticBars(40))).length, 40);
