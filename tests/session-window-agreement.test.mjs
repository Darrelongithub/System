/**
 * SESSION-BUCKET PARITY — the generator's `session` column and the analyzer's
 * own session helper must describe the same clock.
 *
 * The CSV's `session` label is written by the generator (UTC-hour buckets) and
 * the analyzer's `sessionOf()` is the fallback used whenever a CSV carries no
 * session column (a hand-made or third-party file). Both are documented as
 * mirroring each other, and the last NY hour (00:00-00:59 EAT) is the awkward
 * case that already produced one production defect (F6: the tail hour keyed to
 * the wrong opening range).
 *
 * Mutation check (2026-09-17 bug hunt): shrinking the london window's end by one
 * minute in `SESSION_WINDOWS_EAT` survived the entire suite — nothing pinned the
 * shared clock. These tests pin the exact transition instants and the agreement
 * with 9,738 real rows of the locked baseline.
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { eatParts, sessionOf, SESSION_WINDOWS_EAT } from "../src/lib/analyzer/time.ts";

test("session windows: the generator's labels and the analyzer's fallback agree on every baseline row", () => {
  const parsed = parseCsv(loadBaselineCsv());
  assertEqual(parsed.metadataError, undefined, "the locked baseline parses");
  const counts = { asian: 0, london: 0, ny: 0 };
  const mismatches = [];
  for (const candle of parsed.candles) {
    if (candle.invalid) continue;
    const derived = sessionOf(candle.datetime);
    if (derived === undefined) {
      mismatches.push(`${candle.datetime}: analyzer returned no session`);
      continue;
    }
    counts[derived] += 1;
    if (candle.session !== derived) {
      mismatches.push(`${candle.datetime}: csv=${candle.session} analyzer=${derived}`);
    }
  }
  assertEqual(
    mismatches.length,
    0,
    `session label drift:\n  ${mismatches.slice(0, 5).join("\n  ")}`,
  );
  // Non-vacuity: a real partition, not one bucket swallowing everything.
  assert(
    counts.asian > 1000 && counts.london > 1000 && counts.ny > 1000,
    `unbalanced: ${JSON.stringify(counts)}`,
  );
  assertEqual(
    counts.asian + counts.london + counts.ny,
    parsed.candles.filter((c) => !c.invalid).length,
    "every valid row classified",
  );
});

test("session windows: the exact transition instants are pinned, with no gap or overlap", () => {
  const at = (time) => sessionOf(`2026-01-05 ${time}`);
  // Boundaries: asian 01:00-10:59, london 11:00-15:59, ny 16:00-00:59 (EAT).
  assertEqual(at("00:00"), "ny", "midnight is the NY tail hour");
  assertEqual(at("00:30"), "ny", "00:30 stays in the NY tail hour");
  assertEqual(at("00:59"), "ny", "last minute of the NY tail hour");
  assertEqual(at("01:00"), "asian", "asian opens at 01:00");
  assertEqual(at("10:59"), "asian", "last minute of asian");
  assertEqual(at("11:00"), "london", "london opens at 11:00");
  assertEqual(at("15:59"), "london", "last minute of london");
  assertEqual(at("16:00"), "ny", "ny opens at 16:00");
  assertEqual(at("23:59"), "ny", "23:59 is still ny");
  // The windows tile the clock exactly: consecutive boundaries belong to
  // different sessions, and the declared ranges are the ones in force.
  assertDeepEqual(SESSION_WINDOWS_EAT["asian"], { start: 60, end: 659 }, "asian window");
  assertDeepEqual(SESSION_WINDOWS_EAT["london"], { start: 660, end: 959 }, "london window");
  assertDeepEqual(
    SESSION_WINDOWS_EAT["ny"],
    { start: 960, end: 1499 },
    "ny window (rolls past midnight)",
  );
  for (const [session, window] of Object.entries(SESSION_WINDOWS_EAT)) {
    assertEqual(
      at(minutesToTime(window.start)),
      session,
      `${session} start minute classified correctly`,
    );
    assertEqual(
      at(minutesToTime(window.end)),
      session,
      `${session} end minute classified correctly`,
    );
  }
  // Unknown/garbage input must not be bucketed into a session by default.
  assertEqual(at("xx:xx"), undefined, "an unparseable time yields no session");
  assertEqual(sessionOf(""), undefined, "an empty datetime yields no session");
  assertEqual(sessionOf("2026-01-05T11:00:00"), "london", "T separator accepted like the parser");
  assertEqual(eatParts("2026-01-05 11:00:00").minutesOfDay, 660, "minutes-of-day helper");
});

function minutesToTime(minutes) {
  const wrapped = minutes % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}
