import { ROLES, MAP, EXIT_HARNESS, VERDICT_STATE_OF } from "../frozen.mjs";
import { buildMap } from "./map.mjs";
import { parseNaive, formatNaive } from "./dst.mjs";

export const DEV_SEGMENT_RULE = Object.freeze({
  warmupBars: MAP.warmupBars,
  tailBars: EXIT_HARNESS.maxHoldBars,
  years: Object.freeze([
    Object.freeze([2004, 2007]),
    Object.freeze([2009, 2011]),
    Object.freeze([2013, 2015]),
    Object.freeze([2017, 2018]),
  ]),
});

export const yearOf = (bar) => Number(String(bar.datetime).slice(0, 4));

/**
 * Split the ordered feed at every non-DEV bar. Only timestamps are inspected
 * here; non-DEV OHLCV values are never passed to Map, signal, or trade code.
 */
export function splitDevSegments(bars, devYears = ROLES.DEV) {
  const allowed = new Set(devYears);
  const segments = [];
  let i = 0;
  while (i < bars.length) {
    if (!allowed.has(yearOf(bars[i]))) {
      i++;
      continue;
    }
    const start = i;
    while (i < bars.length && allowed.has(yearOf(bars[i]))) i++;
    const part = bars.slice(start, i);
    const firstYear = yearOf(part[0]);
    const lastYear = yearOf(part.at(-1));
    segments.push({
      id: `${firstYear}-${lastYear}`,
      firstYear,
      lastYear,
      globalStart: start,
      globalEnd: i,
      bars: part,
    });
  }
  return segments;
}

export function eligibleEntryRange(segmentLength, { warmupBars = MAP.warmupBars, tailBars = EXIT_HARNESS.maxHoldBars } = {}) {
  const start = Math.min(warmupBars, segmentLength);
  const endExclusive = Math.max(start, segmentLength - tailBars);
  return { start, endExclusive, count: Math.max(0, endExclusive - start) };
}

/** Map/features are computed only from the passed segment's bars. */
export function mapSegment(segment, cfg = MAP) {
  const { features, states } = buildMap(segment.bars, cfg);
  return { ...segment, features, states, cfg };
}

export function mapDevSegments(segments, cfg = MAP) {
  return segments.map((s) => mapSegment(s, cfg));
}

export function summarizeSegments(segments, maps = null) {
  const bySegment = [];
  const byYear = {};
  let totalBars = 0;
  let warmupLost = 0;
  let tailLost = 0;
  let eligibleBars = 0;
  for (const segment of segments) {
    const n = segment.bars.length;
    const range = eligibleEntryRange(n);
    const w = Math.min(MAP.warmupBars, n);
    const t = Math.min(EXIT_HARNESS.maxHoldBars, Math.max(0, n - w));
    const states = maps?.find((m) => m.id === segment.id)?.states;
    const row = {
      id: segment.id,
      firstYear: yearOf(segment.bars[0]),
      lastYear: yearOf(segment.bars.at(-1)),
      bars: n,
      warmupBarsLost: w,
      tailBarsLost: t,
      eligibleBars: range.count,
      byYear: {},
      entryEligibleLastLocalIndex: range.endExclusive - 1,
    };
    for (let i = 0; i < n; i++) {
      const year = yearOf(segment.bars[i]);
      byYear[year] = (byYear[year] ?? 0) + 1;
      if (i >= range.start && i < range.endExclusive) {
        row.byYear[year] ??= { bars: 0, eligibleBars: 0 };
        row.byYear[year].eligibleBars++;
        if (states?.[i]) {
          const s = states[i].state;
          row.byYear[year][s] = (row.byYear[year][s] ?? 0) + 1;
        }
      }
    }
    row.byYear = Object.fromEntries(Object.entries(byYear).filter(([y]) => Number(y) >= row.firstYear && Number(y) <= row.lastYear).map(([y, bars]) => [y, { ...(row.byYear[y] ?? { eligibleBars: 0 }), bars }]));
    bySegment.push(row);
    totalBars += n;
    warmupLost += w;
    tailLost += t;
    eligibleBars += range.count;
  }
  return { totalBars, warmupLost, tailLost, eligibleBars, bySegment };
}

/**
 * Report-only comparison to the old continuous Map. `continuousStates` is not
 * used by any A8 signal, trade, baseline, or verdict calculation.
 */
export function continuousAgreement(segments, segmentMaps, continuousStates) {
  let compared = 0;
  let same = 0;
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const mapped = segmentMaps[s];
    const range = eligibleEntryRange(seg.bars.length);
    for (let i = range.start; i < range.endExclusive; i++) {
      const old = continuousStates[seg.globalStart + i]?.state ?? continuousStates[seg.globalStart + i];
      const now = mapped.states[i]?.state;
      if (old === undefined || now === undefined) continue;
      compared++;
      if (old === now) same++;
    }
  }
  return { comparedBars: compared, agreeingBars: same, agreementPct: compared ? +(100 * same / compared).toFixed(4) : null, reportOnly: true };
}

export function addMinutes(datetime, minutes) {
  const ms = parseNaive(datetime);
  if (ms === undefined) throw new Error(`invalid EAT datetime: ${datetime}`);
  return formatNaive(ms + minutes * 60_000);
}

/** Create a local-index M15 resolver map for this segment only. */
export function m15MapForSegment(segmentBars, allM15Bars) {
  const byDatetime = new Map();
  const start = segmentBars[0]?.datetime;
  const end = segmentBars.at(-1)?.datetime;
  if (!start || !end) return new Map();
  for (const b of allM15Bars) {
    if (b.datetime < start || b.datetime > addMinutes(end, 15)) continue;
    byDatetime.set(b.datetime, b);
  }
  const out = new Map();
  for (let i = 0; i < segmentBars.length; i++) {
    const t0 = segmentBars[i].datetime;
    const t1 = addMinutes(t0, 15);
    const a = byDatetime.get(t0);
    const b = byDatetime.get(t1);
    if (a && b) out.set(i, [a, b]);
  }
  return out;
}

export function stateAt(states, index) {
  const fourState = states[index]?.state ?? "UNKNOWN";
  return { state: fourState, verdictState: VERDICT_STATE_OF[fourState] ?? null };
}
