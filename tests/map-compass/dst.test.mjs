/**
 * G1 timezone contract tests. These pin the measured two-epoch rule so a
 * future "simplification" cannot silently reintroduce the 1-hour session shift.
 */
import { test, assert, assertEqual } from "../tiny.mjs";
import {
  lastSunday,
  euSummerBounds,
  isEuSummerDate,
  parseNaive,
  formatNaive,
  brokerLocalToEat,
  epochOf,
  sessionOfEat,
  EPOCH_B_START,
} from "../../scripts/map-compass/lib/dst.mjs";

test("EU DST boundaries land on the last Sunday of March and October", () => {
  assertEqual(new Date(lastSunday(2020, 3)).toISOString().slice(0, 10), "2020-03-29");
  assertEqual(new Date(lastSunday(2020, 10)).toISOString().slice(0, 10), "2020-10-25");
  assertEqual(new Date(lastSunday(2011, 3)).toISOString().slice(0, 10), "2011-03-27");
  assertEqual(new Date(lastSunday(2024, 10)).toISOString().slice(0, 10), "2024-10-27");
  const [s, e] = euSummerBounds(2020);
  assertEqual(new Date(s).toISOString(), "2020-03-29T01:00:00.000Z");
  assertEqual(new Date(e).toISOString(), "2020-10-25T01:00:00.000Z");
});

test("summer/winter classification matches the measured 2020-2024 transitions", () => {
  assert(!isEuSummerDate(2020, 1, 15), "January is winter");
  assert(isEuSummerDate(2020, 6, 15), "June is summer");
  assert(!isEuSummerDate(2020, 12, 15), "December is winter");
  assert(!isEuSummerDate(2020, 3, 27), "Friday before last Sunday of March is winter");
  assert(isEuSummerDate(2020, 3, 30), "Monday after is summer");
  assert(!isEuSummerDate(2020, 10, 26), "Monday after last Sunday of October is winter");
});

test("parseNaive rejects impossible dates instead of normalising them", () => {
  assert(parseNaive("2015.06.11 07:00") !== undefined);
  assertEqual(parseNaive("2015.02.30 07:00"), undefined);
  assertEqual(parseNaive("garbage"), undefined);
  assertEqual(formatNaive(parseNaive("2015.06.11 07:00")), "2015-06-11 07:00:00");
});

test("epoch boundary is numeric, not string-compared (regression)", () => {
  assertEqual(epochOf("2011.05.06 22:30"), "A");
  assertEqual(epochOf("2011.05.09 01:00"), "B", "exact boundary bar is epoch B");
  assertEqual(epochOf("2011.05.09 00:30"), "A");
  assertEqual(EPOCH_B_START, "2011-05-09 01:00:00");
});

test("epoch B: winter +1h, summer +0h (verified against Dukascopy UTC)", () => {
  assertEqual(brokerLocalToEat("2020.01.15 10:00"), "2020-01-15 11:00:00", "winter");
  assertEqual(brokerLocalToEat("2020.07.15 10:00"), "2020-07-15 10:00:00", "summer");
  assertEqual(brokerLocalToEat("2015.12.15 10:00"), "2015-12-15 11:00:00");
  assertEqual(brokerLocalToEat("2018.08.15 10:00"), "2018-08-15 10:00:00");
});

test("epoch A: winter +2h, summer +1h (the seam that would otherwise be missed)", () => {
  assertEqual(brokerLocalToEat("2010.01.15 10:00"), "2010-01-15 12:00:00", "winter");
  assertEqual(brokerLocalToEat("2010.07.15 10:00"), "2010-07-15 11:00:00", "summer");
  assertEqual(brokerLocalToEat("2011.01.15 10:00"), "2011-01-15 12:00:00");
});

test("conversion is monotonic across the seam (regression for non-monotonic output)", () => {
  const before = parseNaive(brokerLocalToEat("2011.05.06 22:30"));
  const after = parseNaive(brokerLocalToEat("2011.05.09 01:00"));
  assert(
    after > before,
    `seam must not reverse time: ${formatNaive(before)} -> ${formatNaive(after)}`,
  );
});

test("conversion is a pure function — no lookahead, no global state", () => {
  const t = "2020.06.15 10:00";
  const first = brokerLocalToEat(t);
  brokerLocalToEat("2030.01.01 00:00");
  brokerLocalToEat("1999.01.01 00:00");
  assertEqual(brokerLocalToEat(t), first, "other calls must not change the result");
});

test("session windows match src/lib/analyzer/time.ts (EAT)", () => {
  assertEqual(sessionOfEat("2020-06-15 01:00:00"), "asian");
  assertEqual(sessionOfEat("2020-06-15 10:59:00"), "asian");
  assertEqual(sessionOfEat("2020-06-15 11:00:00"), "london");
  assertEqual(sessionOfEat("2020-06-15 15:59:00"), "london");
  assertEqual(sessionOfEat("2020-06-15 16:00:00"), "ny");
  assertEqual(sessionOfEat("2020-06-15 00:30:00"), "ny", "NY owns the midnight tail");
});
