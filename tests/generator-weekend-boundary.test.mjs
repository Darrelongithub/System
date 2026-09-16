/**
 * Generator export boundary: the weekly market closure.
 *
 * The generator used to skip whole UTC Saturday/Sunday calendar days. Because
 * every row is EAT wall clock (UTC+3), that deleted the weekly open — EAT
 * Monday 00:00–02:30 = UTC Sunday 21:00–23:30 — from every exported file:
 * all 41 EAT Mondays in the locked baseline start at 03:00, and the 3,039
 * dangling swing references pointed exactly at those dropped rows.
 *
 * The replacement is a single closure predicate, `isInsideWeekendClosure`,
 * covering [Friday 22:00 UTC, Sunday 21:00 UTC) — the conservative superset of
 * the real FX/metals close (17:00 New York) / open (18:00 New York) that can
 * never delete live trading time in either US DST regime. These tests pin the
 * exact transition instants, the row selector the export plumbing shares, the
 * prune set, and the two end-to-end consequences (weekly-open rows written,
 * data age describing the file).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import {
  buildOhlcCsv,
  isInsideWeekendClosure,
  pruneSwingRefsToExport,
  selectExportedOhlcRows,
} from "../src/lib/ohlc-generator.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";

const BAR_MS = 30 * 60 * 1000;
/** EAT wall-clock label encoded as UTC fields — what the provider returns. */
const eatLabel = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
/** The same instant as the provider would write it for an IANA-free EAT feed. */
const eatLabelOfUtc = (iso) => eatLabel(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
const dropsAtUtc = (iso) => isInsideWeekendClosure(eatLabelOfUtc(iso));

test("generator: weekly closure transitions are exact at both boundaries (EDT and EST weeks)", () => {
  // [UTC instant, expected to be inside the closure, weekday it must actually be]
  const cases = [
    // US daylight time (late June): real close 21:00 UTC, reopen 22:00 UTC.
    [
      "2026-06-19T21:30:00Z",
      false,
      5,
      "Friday 21:30 UTC is still before the latest possible close",
    ],
    ["2026-06-19T21:59:00Z", false, 5, "Friday 21:59 UTC"],
    ["2026-06-19T22:00:00Z", true, 5, "Friday 22:00 UTC — closure starts"],
    ["2026-06-19T22:30:00Z", true, 5, "Friday 22:30 UTC"],
    ["2026-06-19T23:59:00Z", true, 5, "Friday 23:59 UTC"],
    ["2026-06-20T00:00:00Z", true, 6, "Saturday"],
    ["2026-06-20T12:00:00Z", true, 6, "Saturday midday"],
    [
      "2026-06-21T20:59:00Z",
      true,
      0,
      "Sunday 20:59 UTC — closure until the earliest possible open",
    ],
    ["2026-06-21T21:00:00Z", false, 0, "Sunday 21:00 UTC — closure ends"],
    ["2026-06-21T21:30:00Z", false, 0, "Sunday 21:30 UTC"],
    ["2026-06-21T22:00:00Z", false, 0, "Sunday 22:00 UTC (EDT weekly open)"],
    // US standard time (mid January): the real close/open is one hour later, so
    // the conservative window must behave identically.
    ["2026-01-16T21:30:00Z", false, 5, "Friday 21:30 UTC (EST)"],
    ["2026-01-16T21:59:00Z", false, 5, "Friday 21:59 UTC (EST)"],
    ["2026-01-16T22:00:00Z", true, 5, "Friday 22:00 UTC (EST)"],
    ["2026-01-16T22:30:00Z", true, 5, "Friday 22:30 UTC (EST)"],
    ["2026-01-18T20:59:00Z", true, 0, "Sunday 20:59 UTC (EST)"],
    ["2026-01-18T21:00:00Z", false, 0, "Sunday 21:00 UTC (EST)"],
    ["2026-01-18T21:30:00Z", false, 0, "Sunday 21:30 UTC (EST)"],
    ["2026-01-18T22:00:00Z", false, 0, "Sunday 22:00 UTC (EST)"],
    ["2026-01-18T23:00:00Z", false, 0, "Sunday 23:00 UTC (EST weekly open)"],
  ];
  for (const [iso, expected, weekday, label] of cases) {
    assertEqual(new Date(iso).getUTCDay(), weekday, `${label}: fixture weekday`);
    assertEqual(dropsAtUtc(iso), expected, label);
  }
});

test("generator: the stored EAT strings around both transitions keep/drop correctly", () => {
  // EAT = UTC+3. These are the exact wall-clock strings the CSV carries.
  assertEqual(
    isInsideWeekendClosure("2026-06-06 00:30:00"),
    false,
    "Sat 00:30 EAT = Fri 21:30 UTC",
  );
  assertEqual(
    isInsideWeekendClosure("2026-06-06 00:59:00"),
    false,
    "Sat 00:59 EAT = Fri 21:59 UTC",
  );
  assertEqual(isInsideWeekendClosure("2026-06-06 01:00:00"), true, "Sat 01:00 EAT = Fri 22:00 UTC");
  assertEqual(isInsideWeekendClosure("2026-06-06 01:30:00"), true, "Sat 01:30 EAT");
  assertEqual(isInsideWeekendClosure("2026-06-06 02:30:00"), true, "Sat 02:30 EAT");
  assertEqual(isInsideWeekendClosure("2026-06-06 12:00:00"), true, "Sat 12:00 EAT");
  assertEqual(isInsideWeekendClosure("2026-06-06 23:30:00"), true, "Sat 23:30 EAT");
  assertEqual(isInsideWeekendClosure("2026-06-07 00:00:00"), true, "Sun 00:00 EAT");
  assertEqual(isInsideWeekendClosure("2026-06-07 18:00:00"), true, "Sun 18:00 EAT");
  assertEqual(isInsideWeekendClosure("2026-06-07 23:30:00"), true, "Sun 23:30 EAT = Sun 20:30 UTC");
  assertEqual(
    isInsideWeekendClosure("2026-06-08 00:00:00"),
    false,
    "Mon 00:00 EAT = Sun 21:00 UTC — weekly open",
  );
  assertEqual(isInsideWeekendClosure("2026-06-08 00:30:00"), false, "Mon 00:30 EAT");
  assertEqual(
    isInsideWeekendClosure("2026-06-08 01:00:00"),
    false,
    "Mon 01:00 EAT = Sun 22:00 UTC",
  );
  assertEqual(
    isInsideWeekendClosure("2026-06-08 02:30:00"),
    false,
    "Mon 02:30 EAT = Sun 23:30 UTC",
  );
  assertEqual(isInsideWeekendClosure("2026-06-08 03:00:00"), false, "Mon 03:00 EAT");
  assertEqual(
    isInsideWeekendClosure("2026-06-05 23:30:00"),
    false,
    "Fri 23:30 EAT = Fri 20:30 UTC",
  );
  assertEqual(isInsideWeekendClosure("2026-06-03 12:00:00"), false, "midweek");
  // January (EST): identical wall-clock strings must behave identically — the
  // window is deliberately DST-independent.
  assertEqual(isInsideWeekendClosure("2026-01-17 00:30:00"), false, "Sat 00:30 EAT (EST week)");
  assertEqual(isInsideWeekendClosure("2026-01-17 01:00:00"), true, "Sat 01:00 EAT (EST week)");
  assertEqual(isInsideWeekendClosure("2026-01-19 00:00:00"), false, "Mon 00:00 EAT (EST week)");
  assertEqual(isInsideWeekendClosure("2026-01-19 02:30:00"), false, "Mon 02:30 EAT (EST week)");
});

test("generator: an unreadable timestamp is kept, never silently dropped", () => {
  assertEqual(isInsideWeekendClosure(""), false, "empty string is not closure");
  assertEqual(isInsideWeekendClosure("not-a-timestamp"), false, "garbage is not closure");
});

test("generator: selectExportedOhlcRows keeps the weekly open and drops only the closure", () => {
  const week = [];
  for (let ms = Date.UTC(2026, 5, 1, 0, 0); ms <= Date.UTC(2026, 5, 8, 23, 30); ms += BAR_MS) {
    week.push({ datetimeEAT: eatLabel(ms) });
  }
  assertEqual(week.length, 384, "8 EAT days of 30m bars");

  const exported = selectExportedOhlcRows(week);
  const kept = new Set(exported.map((row) => row.datetimeEAT));
  const dropped = week.map((row) => row.datetimeEAT).filter((d) => !kept.has(d));

  assertEqual(exported.length, 290, "exported rows");
  assertEqual(dropped.length, 94, "closure rows");
  assertEqual(exported[0].datetimeEAT, "2026-06-01 00:00:00", "first row of the week kept");
  assertEqual(exported[exported.length - 1].datetimeEAT, "2026-06-08 23:30:00", "last row kept");

  // Exact transitions: last kept bar before the closure, first dropped bar,
  // last dropped bar, first kept bar after the closure.
  assert(kept.has("2026-06-06 00:30:00"), "Fri 21:30 UTC kept");
  assert(!kept.has("2026-06-06 01:00:00"), "Fri 22:00 UTC dropped");
  assertEqual(dropped[0], "2026-06-06 01:00:00", "closure starts exactly at Fri 22:00 UTC");
  assertEqual(
    dropped[dropped.length - 1],
    "2026-06-07 23:30:00",
    "closure ends exactly before Sun 21:00 UTC",
  );
  assert(kept.has("2026-06-08 00:00:00"), "weekly open (Mon 00:00 EAT) kept");
  assert(kept.has("2026-06-08 02:30:00"), "weekly open tail kept");
});

test("generator: pruning against the exported set keeps weekly-open refs and leaves nothing dangling", () => {
  const rows = [
    {
      datetimeEAT: "2026-06-08 00:30:00",
      similarSwingRefs: ["2026-06-08 00:00:00", "2026-06-06 12:00:00", "2026-06-05 12:00:00"],
      similarSwingRetracePct: 42,
      similarSwingContinuedPct: 50,
      swingContextSource: "own_swing",
    },
    {
      datetimeEAT: "2026-06-08 00:00:00",
      similarSwingRefs: [],
      similarSwingRetracePct: null,
      similarSwingContinuedPct: null,
      swingContextSource: null,
    },
    {
      datetimeEAT: "2026-06-05 12:00:00",
      similarSwingRefs: [],
      similarSwingRetracePct: null,
      similarSwingContinuedPct: null,
      swingContextSource: null,
    },
  ];
  const exportedDatetimes = new Set(selectExportedOhlcRows(rows).map((row) => row.datetimeEAT));
  assert(exportedDatetimes.has("2026-06-08 00:00:00"), "weekly-open ref target is exported");
  assert(!exportedDatetimes.has("2026-06-06 12:00:00"), "closure row is not exported");

  const { prunedRefs } = pruneSwingRefsToExport(rows, exportedDatetimes);
  assertEqual(prunedRefs, 1, "only the closure ref is pruned");
  assertEqual(
    rows[0].similarSwingRefs.join("|"),
    "2026-06-08 00:00:00|2026-06-05 12:00:00",
    "the weekly-open ref survives (it was deleted as 'unresolvable' before this fix)",
  );
  for (const row of rows) {
    for (const ref of row.similarSwingRefs) {
      assert(exportedDatetimes.has(ref), `ref ${ref} resolves in the exported set`);
    }
  }
});

/**
 * A synthetic XAU/USD week: mild uptrend plus a 40-bar oscillation, so swing
 * structure, similar-swing matching, refs and retrace/continued values all
 * populate and the export validator (which requires every column non-empty and
 * every ref resolvable) can pass on real code paths.
 */
function syntheticProviderRows({ startEat, endEat }) {
  const rows = [];
  let prevClose = null;
  for (let ms = startEat, i = 0; ms <= endEat; ms += BAR_MS, i++) {
    const level = 2400 + 0.05 * i + 6 * Math.sin((2 * Math.PI * i) / 40);
    const open = prevClose === null ? level : prevClose;
    const close = level;
    const wick = 1.2;
    rows.push({
      datetime: eatLabel(ms),
      open: open.toFixed(2),
      high: (Math.max(open, close) + wick).toFixed(2),
      low: (Math.min(open, close) - wick).toFixed(2),
      close: close.toFixed(2),
    });
    prevClose = close;
  }
  return rows;
}

async function generateWithStubbedProvider({ startDate, endDate, startEat, endEat }) {
  const rows = syntheticProviderRows({ startEat, endEat });
  const originalFetch = globalThis.fetch;
  const logs = [];
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ values: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const csv = await buildOhlcCsv({
      symbol: "XAU/USD",
      startDate,
      endDate,
      specifyTime: false,
      startTime: "00:00",
      endTime: "23:59",
      log: (message) => logs.push(String(message)),
      setCooldown: () => {},
    });
    return { csv, logs };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("generator: a generated file contains the weekly open and no dangling refs (end to end)", async () => {
  const { csv, logs } = await generateWithStubbedProvider({
    startDate: "2026-06-01",
    endDate: "2026-06-08",
    startEat: Date.UTC(2026, 5, 1, 0, 0),
    endEat: Date.UTC(2026, 5, 8, 23, 30),
  });
  assert(csv !== null, `generator produced a CSV (log: ${logs.slice(-4).join(" | ")})`);
  const parsed = parseCsv(csv);
  assert(parsed.metadataError === undefined, "metadata parses");
  const candles = parsed.candles;
  const present = new Set(candles.map((candle) => candle.datetime.trim()));

  assertEqual(candles.length, 290, "exported rows (384 fetched minus the 94 closure rows)");
  // The regression: rows the UTC-calendar rule deleted are in the file.
  assert(present.has("2026-06-08 00:00:00"), "weekly open row is exported");
  assert(present.has("2026-06-08 02:30:00"), "weekly open tail row is exported");
  assert(present.has("2026-06-06 00:30:00"), "last pre-closure row is exported");
  // ...and closure rows still are not.
  assert(!present.has("2026-06-06 01:00:00"), "closure start row absent");
  assert(!present.has("2026-06-07 12:00:00"), "closed Sunday row absent");
  assert(!present.has("2026-06-07 23:30:00"), "closure tail row absent");

  let refs = 0;
  for (const candle of candles) {
    for (const ref of candle.similarSwingRefs) {
      refs += 1;
      assert(present.has(String(ref).trim()), `ref ${ref} resolves inside the exported file`);
    }
  }
  assert(refs > 0, "the fixture exercises swing refs");

  // The analyzer's Metadata type carries only the decision-relevant fields, so
  // the full generator metadata (validation status included) is read from the
  // file's own metadata line.
  const rawMeta = JSON.parse(csv.split("\n")[0].replace(/^# metadata: /, ""));
  assertEqual(rawMeta.validation_status, "VALIDATED", "export validation passed");
  assertEqual(rawMeta.data_age, "2026-06-08 23:30:00 EAT", "data age = newest exported row");
  assertEqual(parsed.meta?.data_age, "2026-06-08 23:30:00 EAT", "data age survives parsing");
  assert(present.has("2026-06-08 23:30:00"), "the reported data age is a row in the file");
});

test("generator: data_age names the newest exported row, never a row excluded from the CSV", async () => {
  // Window ends inside the closure, so the newest provider row (EAT Sunday
  // 23:30) is excluded from the file. The old code reported that excluded row as
  // the data age; the file's newest row is EAT Saturday 00:30 (Fri 21:30 UTC).
  const { csv, logs } = await generateWithStubbedProvider({
    startDate: "2026-06-01",
    endDate: "2026-06-07",
    startEat: Date.UTC(2026, 5, 1, 0, 0),
    endEat: Date.UTC(2026, 5, 7, 23, 30),
  });
  assert(csv !== null, `generator produced a CSV (log: ${logs.slice(-4).join(" | ")})`);
  const parsed = parseCsv(csv);
  const present = new Set(parsed.candles.map((candle) => candle.datetime.trim()));

  assertEqual(parsed.candles.length, 242, "exported rows");
  assert(!present.has("2026-06-07 23:30:00"), "the newest provider row was excluded from the CSV");
  assert(present.has("2026-06-06 00:30:00"), "the newest exported row is in the CSV");
  assertEqual(parsed.meta?.data_age, "2026-06-06 00:30:00 EAT", "data age = newest exported row");
  assert(
    present.has(parsed.meta.data_age.replace(" EAT", "")),
    "metadata.data_age cannot point to a row excluded from the CSV",
  );
});
