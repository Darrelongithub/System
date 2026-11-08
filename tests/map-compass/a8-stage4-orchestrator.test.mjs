import assert from "node:assert/strict";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "../tiny.mjs";
import { MAP, EXIT_HARNESS, ROLES } from "../../scripts/map-compass/frozen.mjs";
import { CLAIM_CARDS } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { resolveTrade } from "../../scripts/map-compass/lib/trade.mjs";
import { costR } from "../../scripts/map-compass/lib/cost.mjs";
import { runBattery } from "../../scripts/map-compass/verify-claims.mjs";
import { m15MapForSegment, yearOf } from "../../scripts/map-compass/lib/dev-segments.mjs";
import {
  assertBaselineCoverage,
  assertCardCount,
  callVerifyReal,
  assertCountFamilies,
  assertCriteriaHash,
  assertFrozenHash,
  assertM15Usage,
  assertPrecomputedRowsEqual,
  assertProductionOutputsAbsent,
  assertRowCount,
  assertSegmentSpans,
  assertTimestampsAligned,
  assertTradeBoundaries,
  boundedM15ForSegments,
  inspectTrades,
  runDryInspection,
} from "../../scripts/map-compass/a8-stage4-orchestrator.mjs";

const equal = (actual, expected, label) => assert.equal(actual, expected, label);
const throwsPrefix = (fn, prefix) =>
  assert.throws(
    fn,
    (error) => error.message.startsWith(prefix),
    `expected error beginning ${prefix}`,
  );

function tradeFixture(overrides = {}) {
  return {
    strategyId: "donchian-20",
    family: "channel-breakout",
    side: "long",
    session: "london",
    vol: "mid",
    year: 2004,
    day: "2004-01-01",
    entryDatetime: "2004-01-01 00:00:00",
    exitDatetime: "2004-01-01 00:30:00",
    localIndex: MAP.warmupBars,
    exitIndex: MAP.warmupBars + 1,
    segmentId: "2004-2007",
    segmentLength: MAP.warmupBars + EXIT_HARNESS.maxHoldBars + 10,
    state: "EXPANSION",
    verdictState: "EFFICIENT",
    barsHeld: 1,
    grossR: 0.44808,
    costR: 0.14808,
    netR: 0.3,
    ...overrides,
  };
}

function segmentFixture(length = MAP.warmupBars + EXIT_HARNESS.maxHoldBars + 10) {
  const bars = Array.from({ length }, (_, index) => ({
    datetime: `2004-01-01 ${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}:00`,
  }));
  return { id: "2004-2007", bars };
}

function expectedCountFixture() {
  return {
    rawBySegment: {
      "2004-2007": 39448,
      "2009-2011": 33862,
      "2013-2015": 35147,
      "2017-2018": 23465,
    },
    eligibleBySegment: {
      "2004-2007": 38352,
      "2009-2011": 32766,
      "2013-2015": 34051,
      "2017-2018": 22369,
    },
    rawTotal: 131922,
    eligibleTotal: 127538,
  };
}

function edgeTrades() {
  // Planted net edge is +0.300R with deterministic noise bounded to ±0.010R.
  const session = "london";
  const vol = "mid";
  const cost = costR({ session, vol, variant: "baseline" });
  assert.ok(
    Math.abs(cost - 0.14808) < 1e-12,
    "baseline cost calculation is anchored to the approved cost table",
  );
  return Array.from({ length: 1000 }, (_, index) => {
    const yearIndex = index % ROLES.DEV.length;
    const year = ROLES.DEV[yearIndex];
    const month = String(1 + (Math.floor(index / ROLES.DEV.length) % 12)).padStart(2, "0");
    const day = String(1 + Math.floor(index / (ROLES.DEV.length * 12))).padStart(2, "0");
    const datetime = `${year}-${month}-${day} 00:00:00`;
    const noise = ((index % 11) - 5) * 0.002;
    const desiredNetR = 0.3 + noise;
    const grossR = desiredNetR + cost;
    const risk = EXIT_HARNESS.stopAtrMultiple;
    const exitClose = 100 + grossR * risk;
    const bars = [
      { datetime, o: 100, h: 100.1, l: 99.9, c: 100, v: 1 },
      { datetime: `${year}-${month}-${day} 00:30:00`, o: 100, h: 100.2, l: 99.8, c: 100.1, v: 1 },
      {
        datetime: `${year}-${month}-${day} 01:00:00`,
        o: 100.1,
        h: 100.2,
        l: 99.8,
        c: exitClose,
        v: 1,
      },
    ];
    const result = resolveTrade(bars, 0, "long", 1, {
      session,
      vol,
      maxBars: EXIT_HARNESS.maxHoldBars,
    });
    return {
      strategyId: "donchian-20",
      family: "channel-breakout",
      side: "long",
      session,
      vol,
      year,
      day: `${year}-${month}-${day}`,
      entryBar: datetime,
      entryDatetime: datetime,
      localIndex: MAP.warmupBars,
      segmentId: `${year}-${year}`,
      segmentLength: MAP.warmupBars + EXIT_HARNESS.maxHoldBars + 10,
      state: "EXPANSION",
      verdictState: "EFFICIENT",
      ...result,
    };
  });
}

test("Stage 4 accounting: hand-calculated stop, spread, and one-round-trip net R", () => {
  const bars = [
    { datetime: "2004-01-01 00:00:00", o: 100, h: 100, l: 100, c: 100, v: 1 },
    { datetime: "2004-01-01 00:30:00", o: 100, h: 100.2, l: 98, c: 99, v: 1 },
  ];
  // Hand calculation: risk = 1.5 * ATR = 1.5, so stop = 100 - 1.5 = 98.5.
  // The fill loses exactly 1R. Round-trip cost = (0.18212 spread ATR + 0.04
  // slippage ATR) / 1.5 = 0.14808R; net = -1 - 0.14808 = -1.14808R.
  const result = resolveTrade(bars, 0, "long", 1, {
    session: "london",
    vol: "mid",
    variant: "baseline",
  });
  equal(result.outcome, "SL", "stop outcome");
  equal(result.exitIndex, 1, "exit bar index");
  equal(result.exitPrice, 98.5, "stop fill = entry - 1.5 ATR");
  equal(result.grossR, -1, "gross loss is exactly one R");
  equal(result.costR, 0.14808, "round-trip spread + slippage cost");
  equal(result.netR, -1.14808, "net = -1R - 0.14808R cost");
  equal(result.barsHeld, 1, "one M30 bar elapsed before the stop exit");
});

test("Stage 4 planted edge: one synthetic card recovers a noisy +0.30R edge and leaves an unplanted claim unconfirmed", () => {
  const trades = edgeTrades();
  assert.equal(trades.length, 1000);
  assert.ok(trades.every((trade) => trade.netR >= 0.29 && trade.netR <= 0.31));
  const baseline = {
    a8Segmented: true,
    fineCellsVerdictState: {
      "EFFICIENT|long|london|mid": { n: 200, meanNetR: 0, sufficient: true },
    },
  };
  assertBaselineCoverage(trades, baseline);
  const rows = runBattery(trades, { windowKind: "DEV", baseline, sensitivityByClaim: {} });
  const repeatedRows = runBattery(trades, { windowKind: "DEV", baseline, sensitivityByClaim: {} });
  assert.equal(
    assertPrecomputedRowsEqual(rows, repeatedRows),
    true,
    "independent runBattery outputs are exactly equal",
  );
  const perturbedRows = structuredClone(repeatedRows);
  perturbedRows[0].stats.meanNetR += 1;
  throwsPrefix(
    () => assertPrecomputedRowsEqual(perturbedRows, rows),
    "STAGE4_ABORT[PRECOMPUTED_ROWS_MISMATCH]: precomputed rows differ from runBattery output",
  );
  const planted = rows.find((row) => row.claimId === "donchian-20" && row.kind === "strength");
  const unplanted = rows.find((row) => row.claimId === "donchian-20" && row.kind === "weakness");
  assert.equal(
    planted.verdict,
    "CONFIRMED",
    `planted +0.30R result; stats=${JSON.stringify(planted.stats)}`,
  );
  assert.ok(
    Math.abs(planted.stats.meanNetR - 0.3) < 0.003,
    `mean should recover ~+0.30R, got ${planted.stats.meanNetR}`,
  );
  assert.notEqual(unplanted.verdict, "CONFIRMED", "unplanted weakness is not confirmed");
  console.log(
    `[Stage 4 planted-edge recovered] card=donchian-20 verdictState=${planted.state} kind=${planted.kind} verdict=${planted.verdict} n=${planted.stats.n} meanNetR=${planted.stats.meanNetR.toFixed(6)}R noiseBound=±0.010R; unplanted ${unplanted.state}/${unplanted.kind}=${unplanted.verdict}`,
  );
  assert.equal(rows.length, CLAIM_CARDS.length * 2);
});

test("Stage 4 passes all 44 precomputed rows to verifyReal exactly as a fresh runBattery call", () => {
  const trades = edgeTrades();
  const baseline = {
    a8Segmented: true,
    fineCellsVerdictState: {
      "EFFICIENT|long|london|mid": { n: 200, meanNetR: 0, sufficient: true },
    },
  };
  const sensitivityByClaim = {};
  const precomputedRows = runBattery(trades, { windowKind: "DEV", baseline, sensitivityByClaim });
  const freshRows = runBattery(trades, { windowKind: "DEV", baseline, sensitivityByClaim });
  assert.equal(precomputedRows.length, 44);
  assert.equal(assertPrecomputedRowsEqual(precomputedRows, freshRows), true);
  let passedToVerifier;
  const fakeVerifyReal = (tradePath, options) => {
    passedToVerifier = { tradePath, options };
    return { rows: options.precomputedRows };
  };
  const result = callVerifyReal(fakeVerifyReal, "in-memory-trades.jsonl", {
    baseline,
    sensitivityByClaim,
    precomputedRows,
  });
  assert.equal(passedToVerifier.tradePath, "in-memory-trades.jsonl");
  assert.deepEqual(passedToVerifier.options.precomputedRows, freshRows);
  assert.equal(passedToVerifier.options.a8DevOnly, true);
  assert.deepEqual(result.rows, precomputedRows);
});

test("Stage 4 abort guards: all exact preflight guards fail closed with their specified templates", () => {
  const counts = expectedCountFixture();
  assertCountFamilies(counts);

  throwsPrefix(
    () => assertTradeBoundaries([tradeFixture({ year: 2019 })], []),
    "STAGE4_ABORT[NON_DEV_YEAR]: trade year 2019 is outside ROLES.DEV",
  );
  throwsPrefix(
    () =>
      assertTradeBoundaries([tradeFixture({ localIndex: MAP.warmupBars - 1 })], [segmentFixture()]),
    "STAGE4_ABORT[ENTRY_BEFORE_WARMUP]:",
  );
  const shortLength = MAP.warmupBars + EXIT_HARNESS.maxHoldBars;
  throwsPrefix(
    () =>
      assertTradeBoundaries(
        [tradeFixture({ localIndex: MAP.warmupBars, segmentLength: shortLength })],
        [segmentFixture(shortLength)],
      ),
    "STAGE4_ABORT[INSUFFICIENT_SEGMENT_TAIL]:",
  );
  throwsPrefix(
    () =>
      assertTradeBoundaries(
        [tradeFixture({ exitIndex: MAP.warmupBars + EXIT_HARNESS.maxHoldBars + 1 })],
        [segmentFixture()],
      ),
    "STAGE4_ABORT[SEGMENT_CROSSING]:",
  );

  const sealedSegment = {
    id: "2004-2007",
    bars: [{ datetime: "2007-12-31 23:45:00", o: 1, h: 1, l: 1, c: 1, v: 0 }],
  };
  throwsPrefix(
    () =>
      assertM15Usage(
        [sealedSegment],
        new Map([
          [
            sealedSegment.id,
            new Map([
              [0, [{ datetime: "2007-12-31 23:45:00" }, { datetime: "2008-01-01 00:00:00" }]],
            ]),
          ],
        ]),
      ),
    "STAGE4_ABORT[M15_SEALED_READ]: segment=2004-2007 datetime=2008-01-01 00:00:00 year=2008",
  );

  throwsPrefix(
    () =>
      assertCountFamilies({
        ...counts,
        rawBySegment: { ...counts.rawBySegment, "2004-2007": 39447 },
      }),
    "STAGE4_ABORT[SEGMENT_BAR_COUNT]: segment=2004-2007 expected=39448 actual=39447",
  );
  throwsPrefix(
    () => assertCountFamilies({ ...counts, rawTotal: 131921 }),
    "STAGE4_ABORT[DEV_TOTAL_BAR_COUNT]: expected=131922 actual=131921",
  );
  throwsPrefix(
    () =>
      assertCountFamilies({
        ...counts,
        eligibleBySegment: { ...counts.eligibleBySegment, "2004-2007": 38351 },
      }),
    "STAGE4_ABORT[SEGMENT_ELIGIBLE_COUNT]: segment=2004-2007 expected=38352 actual=38351",
  );
  throwsPrefix(
    () => assertCountFamilies({ ...counts, eligibleTotal: 127537 }),
    "STAGE4_ABORT[DEV_TOTAL_ELIGIBLE_COUNT]: expected=127538 actual=127537",
  );
  throwsPrefix(
    () => assertCountFamilies(counts, { identitySegmentCount: 3 }),
    "STAGE4_ABORT[DEV_ELIGIBILITY_IDENTITY]: raw=131922 excluded=",
  );

  throwsPrefix(
    () => assertBaselineCoverage([tradeFixture()], { fineCellsVerdictState: {} }),
    "STAGE4_ABORT[NO_BASELINE]: strategyId=donchian-20 state=EFFICIENT side=long session=london vol=mid year=2004",
  );
  throwsPrefix(() => assertCardCount(21), "STAGE4_ABORT[CARD_COUNT]: expected 22 cards, got 21");
  throwsPrefix(
    () => assertRowCount([], 22),
    "STAGE4_ABORT[ROW_COUNT]: expected 44 center rows, got 0",
  );
  throwsPrefix(
    () => assertCriteriaHash("wrong"),
    "STAGE4_ABORT[CRITERIA_HASH]: expected 788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6, got wrong",
  );
  throwsPrefix(
    () => assertFrozenHash("wrong"),
    "STAGE4_ABORT[FROZEN_HASH]: expected 67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22, got wrong",
  );
  const outputRoot = mkdtempSync(join(tmpdir(), "a8-stage4-guard-"));
  try {
    for (const relative of [
      "artifacts/map-compass/claim-verification.json",
      "artifacts/map-compass/claimed-trades.jsonl",
      "docs/G0-STAGE4-REPORT.md",
    ]) {
      const path = join(outputRoot, relative);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "sentinel");
      throwsPrefix(
        () => assertProductionOutputsAbsent(outputRoot),
        `STAGE4_ABORT[OUTPUT_EXISTS]: ${relative} already exists; Stage 4 is single-use`,
      );
      rmSync(path);
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }

  const rows = [{ claimId: "x", kind: "strength", stats: { n: 1 } }];
  assert.doesNotThrow(() => assertPrecomputedRowsEqual(rows, structuredClone(rows)));
  throwsPrefix(
    () => assertPrecomputedRowsEqual(rows, [{ ...rows[0], verdict: "REFUTED" }]),
    "STAGE4_ABORT[PRECOMPUTED_ROWS_MISMATCH]: precomputed rows differ from runBattery output",
  );
});

test("Stage 4 count families are independently asserted, exact, and satisfy the no-tolerance identity", () => {
  assert.equal(assertCountFamilies(expectedCountFixture()), true);
  const alteredRaw = expectedCountFixture();
  alteredRaw.rawBySegment["2017-2018"]++;
  throwsPrefix(() => assertCountFamilies(alteredRaw), "STAGE4_ABORT[SEGMENT_BAR_COUNT]:");
});

test("Stage 4 M15 sealed-read proof: bounded selection excludes segmentEnd + 15 and the assertion catches injection", () => {
  const segment = {
    id: "2004-2007",
    bars: [
      { datetime: "2007-12-31 23:15:00", o: 1, h: 1, l: 1, c: 1, v: 0 },
      { datetime: "2007-12-31 23:45:00", o: 1, h: 1, l: 1, c: 1, v: 0 },
    ],
  };
  const first = { datetime: "2007-12-31 23:15:00", o: 1, h: 1, l: 1, c: 1, v: 0 };
  const middle = { datetime: "2007-12-31 23:30:00", o: 1, h: 1, l: 1, c: 1, v: 0 };
  const last = { datetime: "2007-12-31 23:45:00", o: 1, h: 1, l: 1, c: 1, v: 0 };
  const sealed = { datetime: "2008-01-01 00:00:00", o: 1, h: 1, l: 1, c: 1, v: 0 };
  const bounded = boundedM15ForSegments([segment], [first, middle, last, sealed]);
  assert.deepEqual(
    bounded.map((bar) => bar.datetime),
    [first.datetime, middle.datetime, last.datetime],
  );
  const safeMap = m15MapForSegment(segment.bars, bounded);
  assert.equal(assertM15Usage([segment], new Map([[segment.id, safeMap]])), true);
  assert.deepEqual(
    [...safeMap.values()].flat().map((bar) => bar.datetime),
    [first.datetime, middle.datetime],
  );
  assert.equal(
    [...safeMap.values()].flat().some((bar) => yearOf(bar) === 2008),
    false,
  );
  const injectedMap = m15MapForSegment(segment.bars, [...bounded, sealed]);
  const injected = new Map([[segment.id, injectedMap]]);
  throwsPrefix(
    () => assertM15Usage([segment], injected),
    "STAGE4_ABORT[M15_SEALED_READ]: segment=2004-2007 datetime=2008-01-01 00:00:00 year=2008",
  );
});

test("Stage 4 map alignment and segment-span guards reject timestamp drift and unexpected ranges", () => {
  assert.doesNotThrow(() =>
    assertTimestampsAligned(
      [{ datetime: "2004-01-01 00:00:00" }],
      [{ datetime: "2004-01-01 00:00:00", state: "EXPANSION" }],
    ),
  );
  throwsPrefix(
    () =>
      assertTimestampsAligned(
        [{ datetime: "2004-01-01 00:00:00" }],
        [{ datetime: "2004-01-01 00:30:00", state: "EXPANSION" }],
      ),
    "STAGE4_ABORT[MAP_ALIGNMENT]: row=1",
  );
  throwsPrefix(() => assertSegmentSpans([]), "STAGE4_ABORT[UNEXPECTED_SEGMENTS]:");
});

test("Stage 4 --dry-run writes only the two dry files and creates no production output or ledger", async () => {
  const root = mkdtempSync(join(tmpdir(), "a8-stage4-dry-"));
  try {
    const length = MAP.warmupBars + EXIT_HARNESS.maxHoldBars + 10;
    const segment = {
      id: "2004-2007",
      bars: Array.from({ length }, (_, index) => ({
        datetime: `2004-01-${String(1 + Math.floor(index / 48)).padStart(2, "0")} ${String(Math.floor((index % 48) / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}:00`,
      })),
    };
    const trade = {
      ...tradeFixture(),
      segmentLength: length,
      localIndex: MAP.warmupBars,
      exitIndex: MAP.warmupBars + 1,
      exitDatetime: segment.bars[MAP.warmupBars + 1].datetime,
      entryDatetime: segment.bars[MAP.warmupBars].datetime,
      barsHeld: 1,
    };
    const result = await runDryInspection({
      root,
      buildInputs: () => ({
        pipeline: { centerTrades: [trade] },
        segments: [segment],
        m15MissingSecondBySegment: { "2004-2007": 0 },
      }),
    });
    assert.equal(existsSync(result.tradePath), true);
    assert.equal(existsSync(result.inspectionPath), true);
    assert.deepEqual(readdirSync(join(root, "artifacts/map-compass/stage4-dry")).sort(), [
      "claimed-trades.dry.jsonl",
      "inspection.json",
    ]);
    const dryBytes = readFileSync(result.tradePath, "utf8");
    assert.equal(JSON.parse(dryBytes.trim()).strategyId, "donchian-20");
    const inspection = JSON.parse(readFileSync(result.inspectionPath, "utf8"));
    assert.equal(inspection.tradeJsonlSha256.length, 64);
    assert.equal(inspection.sealedYearEntries, 0);
    assert.equal(inspection.perCard["donchian-20"].sideIdentity, true);
    assert.equal(inspection.perCard["donchian-20"].stateIdentity, true);
    assert.equal(inspection.eligibleRangesBySegment["2004-2007"].start, MAP.warmupBars);
    assert.equal(inspection.totalMissingSecondM15.count, 0);
    assert.equal(inspection.totalMissingSecondM15.share, 0);
    for (const relative of [
      "artifacts/map-compass/claim-verification.json",
      "artifacts/map-compass/claimed-trades.jsonl",
      "artifacts/map-compass/claim-ledger.jsonl",
      "docs/G0-STAGE4-REPORT.md",
    ])
      assert.equal(
        existsSync(join(root, relative)),
        false,
        `${relative} must remain absent in dry mode`,
      );
    assert.deepEqual(result.inspection.years, { 2004: 1, TOTAL: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
