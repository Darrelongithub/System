/**
 * Filter opt-out fidelity — disabling Filter F must reproduce the certified
 * v1.7 (Filter-C-only) book **exactly**, not merely to two decimal places.
 *
 * This is the "can we take it back?" guarantee. A filter that subtly rewrote
 * history when disabled would make every before/after comparison in the research
 * logs unfalsifiable, so the check is a hash over the full canonical row stream
 * (order included), pinned to the value computed from the v1.4/v1.7 golden
 * artifact as it stood before Filter F shipped (commit 4cba607 —
 * `artifacts/golden-trades.json`), plus its published aggregates.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { createHash } from "node:crypto";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";

/** sha256 of the 2,323-row book as it stood in the pre-Filter-F golden. */
const LEGACY_ROW_HASH = "42b3d546621a1b273d6e8d254de9bd942aa4948c00fae063aece9fcd78114697";
const LEGACY_TOTALS = {
  triggers: 2323,
  tp: 756,
  sl: 1563,
  open: 4,
  noFill: 0,
  rSum: 523.6813503963194,
};

const FIELDS = [
  "strategyId",
  "datetime",
  "index",
  "side",
  "entry",
  "sl",
  "tp",
  "rr",
  "setupStatus",
  "outcome",
  "exitDatetime",
  "exitPrice",
  "rMultiple",
  "reason",
];

const canonical = (rows) =>
  rows.map((t) => FIELDS.map((f) => `${t[f] ?? ""}`).join("|")).join("\n");

let cached = null;
const optOutRun = () => {
  if (!cached) {
    // The opt-out exists for research; the certified configuration plus
    // enableFilterF:false is the v1.4/v1.7 production book.
    const result = runAnalysis(loadBaselineCsv(), {
      ...ANALYZER_CERTIFIED_OPTIONS,
      enableFilterF: false,
    });
    if (!result.ok) throw new Error(result.error);
    cached = result.analysis;
  }
  return cached;
};

test("filter F opt-out: reproduces the pre-Filter-F book row-for-row and aggregate-for-aggregate", () => {
  const analysis = optOutRun();
  const rows = analysis.tradePasses;
  assertEqual(rows.length, LEGACY_TOTALS.triggers, "trade count");

  assertEqual(
    createHash("sha256").update(canonical(rows), "utf8").digest("hex"),
    LEGACY_ROW_HASH,
    "canonical row stream (order + all 14 fields)",
  );

  const totals = { triggers: rows.length, tp: 0, sl: 0, open: 0, noFill: 0, rSum: 0 };
  for (const t of rows) {
    if (t.outcome === "TP") totals.tp += 1;
    else if (t.outcome === "SL") totals.sl += 1;
    else if (t.outcome === "NO_FILL") totals.noFill += 1;
    else totals.open += 1;
    totals.rSum += typeof t.rMultiple === "number" ? t.rMultiple : 0;
  }
  assertEqual(totals.tp, LEGACY_TOTALS.tp, "TP");
  assertEqual(totals.sl, LEGACY_TOTALS.sl, "SL");
  assertEqual(totals.open, LEGACY_TOTALS.open, "OPEN");
  assertEqual(totals.noFill, LEGACY_TOTALS.noFill, "NO_FILL");
  assertEqual(totals.rSum, LEGACY_TOTALS.rSum, "total R");
});

test("filter F opt-out: the two books differ only through Filter F's own rejections", () => {
  const optOut = optOutRun();
  assertEqual(
    optOut.results.filter((r) => r.reason?.startsWith("FILTER_F")).length,
    0,
    "opt-out must not produce FILTER_F rows",
  );

  const shipped = runAnalysis(loadBaselineCsv(), ANALYZER_CERTIFIED_OPTIONS);
  assert(shipped.ok, "shipped run must succeed");
  assertEqual(shipped.analysis.tradePasses.length, 2286, "shipped trade count");
  assertEqual(
    optOut.tradePasses.length - shipped.analysis.tradePasses.length,
    37,
    "net trades Filter F removes from the C-only book (92 rejections - 55 slot refills)",
  );

  const key = (r) => `${r.strategyId}|${r.datetime}|${r.index}|${r.side ?? "-"}`;
  const shippedKeys = new Set(shipped.analysis.tradePasses.map(key));
  const optOutKeys = new Set(optOut.tradePasses.map(key));
  const onlyOptOut = [...optOutKeys].filter((k) => !shippedKeys.has(k));
  const onlyShipped = [...shippedKeys].filter((k) => !optOutKeys.has(k));

  // 85 of the 92 rejected rows are taken in the opt-out book; the other 7 find
  // their slot already consumed (in the opt-out book the earlier rejection is a
  // real trade that consumes it). Every extra trade must trace to Filter F.
  const fRejected = new Set(
    shipped.analysis.results.filter((r) => r.reason?.startsWith("FILTER_F")).map(key),
  );
  assertEqual(
    onlyOptOut.length,
    85,
    "trades the opt-out book takes that the shipped book does not",
  );
  assert(
    onlyOptOut.every((k) => fRejected.has(k)),
    "every extra trade in the opt-out book must be a Filter F rejection in the shipped book",
  );

  // The other direction is the cost side: freed slots the engine refills.
  assertEqual(
    onlyShipped.length,
    48,
    "refills — trades the shipped book takes that the opt-out does not",
  );
});
