/**
 * Generator swing-ref integrity.
 *
 * The analyzer resolves `similar_swing_refs` strictly by datetime, so a ref that
 * points at a row the exported CSV does not contain is silently dropped — the
 * locked baseline carries 3,039 of them (6.8 %), all refs into UTC weekend days
 * that the export skips. That is exactly the class of defect the series-contract
 * gate catches at analysis time; these tests cover the production side, where the
 * fix belongs:
 *
 *   - `pruneSwingRefsToExport` drops refs that cannot resolve in the file it is
 *     about to write, keeping the exporter's own invariant
 *     (`refs.length > 0 === retrace !== null`) intact;
 *   - a row left with no refs has its derived swing columns cleared rather than
 *     left dangling;
 *   - rows whose refs all resolve are untouched (no silent data loss).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { pruneSwingRefsToExport } from "../src/lib/ohlc-generator.ts";

const row = (datetime, refs, extra = {}) => ({
  datetimeEAT: datetime,
  similarSwingRefs: refs,
  similarSwingRetracePct: refs.length > 0 ? 42 : null,
  similarSwingContinuedPct: refs.length > 0 ? 50 : null,
  swingContextSource: refs.length > 0 ? "own_swing" : null,
  ...extra,
});

test("generator: refs that cannot resolve in the exported file are pruned, not left dangling", () => {
  const rows = [
    row("2026-01-05 10:00:00", ["2026-01-05 08:00:00", "2026-01-04 02:00:00"]), // weekend ref
    row("2026-01-05 10:30:00", ["2026-01-05 08:00:00"]), // all resolve
  ];
  const exported = new Set(["2026-01-05 10:00:00", "2026-01-05 10:30:00", "2026-01-05 08:00:00"]);

  const result = pruneSwingRefsToExport(rows, exported);

  assertEqual(result.prunedRefs, 1, "one ref pruned");
  assertEqual(result.rowsLeftWithoutRefs, 0, "no row was emptied");
  assertEqual(
    rows[0].similarSwingRefs.join("|"),
    "2026-01-05 08:00:00",
    "dangling ref removed, valid ref kept",
  );
  assertEqual(rows[1].similarSwingRefs.length, 1, "already-valid row untouched");
  // Every remaining ref resolves in the exported file — the invariant the
  // export validator asserts must hold after pruning.
  for (const r of rows)
    for (const ref of r.similarSwingRefs) assert(exported.has(ref), `ref ${ref} resolves`);
});

test("generator: a row emptied by pruning loses its now-meaningless swing columns", () => {
  const rows = [row("2026-01-05 10:00:00", ["2026-01-04 02:00:00"])];
  const result = pruneSwingRefsToExport(rows, new Set(["2026-01-05 10:00:00"]));

  assertEqual(result.prunedRefs, 1, "the only ref was pruned");
  assertEqual(result.rowsLeftWithoutRefs, 1, "row reported as emptied");
  assertEqual(rows[0].similarSwingRefs.length, 0, "no refs left");
  assertEqual(rows[0].similarSwingRetracePct, null, "retrace cleared (exporter invariant)");
  assertEqual(rows[0].similarSwingContinuedPct, null, "continued cleared");
  assertEqual(rows[0].swingContextSource, null, "source cleared");
});

test("generator: a fully resolvable file is unchanged", () => {
  const refs = ["2026-01-05 08:00:00", "2026-01-05 06:00:00"];
  const rows = [row("2026-01-05 10:00:00", [...refs])];
  const result = pruneSwingRefsToExport(rows, new Set(["2026-01-05 10:00:00", ...refs]));

  assertEqual(result.prunedRefs, 0, "nothing pruned");
  assertEqual(result.rowsLeftWithoutRefs, 0, "nothing emptied");
  assertEqual(rows[0].similarSwingRefs.join("|"), refs.join("|"), "refs preserved in order");
  assertEqual(rows[0].similarSwingRetracePct, 42, "derived columns preserved");
});
