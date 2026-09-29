/* MT5 server daemon feed: pure helper invariants (no network, no timers). */
import { test, assert, assertEqual } from "./tiny.mjs";
import {
  BAR_MS,
  FEED_WINDOW_DAYS,
  FETCH_GRACE_MS,
  barBoundaryFor,
  feedWindowDates,
  lastCloseFromCsv,
  nextFetchAtAfter,
} from "../src/lib/mt5/server-daemon.ts";
import { CHUNK_SPAN_DAYS } from "../src/lib/ohlc-generator.ts";

test("daemon-feed: 30-min bar boundaries are epoch-aligned (EAT has no DST)", () => {
  assertEqual(BAR_MS, 30 * 60 * 1000, "one bar is exactly 30 minutes");

  const t = Date.UTC(2026, 2, 9, 14, 47, 33, 999); // arbitrary instant
  const boundary = barBoundaryFor(t);
  assertEqual(boundary % BAR_MS, 0, "boundary lands on a 30-min epoch multiple");
  assert(boundary <= t, "boundary never in the future");
  assert(t - boundary < BAR_MS, "boundary floors into the current bar");
  // EAT is UTC+3 with no DST, so wall-clock 30-min marks always coincide with
  // epoch multiples — the boundary must not shift across DST-style dates.
  const dstEra = Date.UTC(2026, 10, 1, 12, 29, 59);
  assertEqual(
    barBoundaryFor(dstEra),
    Date.UTC(2026, 10, 1, 12, 0, 0),
    "boundary stable through dates that would shift under DST calendars",
  );
  assertEqual(
    barBoundaryFor(Date.UTC(2026, 10, 1, 12, 0, 0)),
    Date.UTC(2026, 10, 1, 12, 0, 0),
    "exact boundary maps to itself",
  );
});

test("daemon-feed: next fetch is the next bar start plus grace", () => {
  const barStart = Date.UTC(2026, 2, 9, 14, 30, 0);
  const nextFetch = nextFetchAtAfter(barStart);
  assertEqual(nextFetch, barStart + BAR_MS + FETCH_GRACE_MS, "next bar start + grace");
  assertEqual(FETCH_GRACE_MS, 60_000, "grace is 60 seconds");
  // Chained scheduling marches forward bar by bar without drift: consecutive
  // bar starts → consecutive fetch instants exactly one bar apart.
  assertEqual(
    nextFetchAtAfter(barStart + BAR_MS) - nextFetchAtAfter(barStart),
    BAR_MS,
    "consecutive fetch instants are exactly one bar apart",
  );
});

test("daemon-feed: lastCloseFromCsv finds close by header name and skips === markers", () => {
  // No volume column: close is column 4.
  const withoutVolume = [
    "datetime,open,high,low,close,direction,body",
    "=== MONDAY 2026-03-09 (UTC) ===",
    "2026-03-09 14:00,10.00,10.50,9.80,10.25,Bullish,0.25",
    "2026-03-09 14:30,10.25,10.90,10.20,10.80,Bullish,0.55",
    "=== TUESDAY 2026-03-10 (UTC) ===",
    "2026-03-10 00:00,10.80,11.00,10.70,10.95,Bullish,0.15",
  ].join("\n");
  assertEqual(lastCloseFromCsv(withoutVolume), 10.95, "close of the last real row");

  // Volume column present: positional index of close is unchanged here, but the
  // parser must locate it by NAME regardless of layout.
  const withVolume = [
    "datetime,open,high,low,close,volume,direction",
    "2026-03-09 14:00,10.00,10.50,9.80,10.25,1234,Bullish",
    "2026-03-09 14:30,10.25,10.90,10.20,10.80,987,Bullish",
  ].join("\n");
  assertEqual(lastCloseFromCsv(withVolume), 10.8, "close found with volume column present");

  // Volume BEFORE close shifts the positional index — name lookup must survive.
  const shiftedColumns = [
    "datetime,volume,open,high,low,close,direction",
    "2026-03-09 14:30,987,10.25,10.90,10.20,10.77,Bullish",
  ].join("\n");
  assertEqual(lastCloseFromCsv(shiftedColumns), 10.77, "close found at shifted index");

  // === markers and blank lines are skipped, never mistaken for data.
  assertEqual(lastCloseFromCsv("=== WEEKEND / SKIPPED ==="), null, "markers-only file → null");
  assertEqual(lastCloseFromCsv(""), null, "empty file → null");
  assertEqual(lastCloseFromCsv("datetime,open,high,low,close"), null, "header-only file → null");
});

test("daemon-feed: rolling feed window stays under the single-request chunk cap", () => {
  const now = Date.UTC(2026, 8, 29, 15, 0, 0);
  const { startDate, endDate } = feedWindowDates(now);
  // Window is FEED_WINDOW_DAYS inclusive, ending today.
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  const inclusiveDays = Math.round((endMs - startMs) / 86_400_000) + 1;
  assertEqual(inclusiveDays, FEED_WINDOW_DAYS, "window spans FEED_WINDOW_DAYS days");
  assertEqual(endDate, "2026-09-29", "window ends on the current day");

  // buildOhlcCsv pads the request by 1 day before / 2 days after; the padded
  // span must stay ≤ the 90-day single-request cap so the daemon never enters
  // the chunked multi-request path.
  const paddedSpanDays = inclusiveDays + 3;
  assert(
    paddedSpanDays <= CHUNK_SPAN_DAYS,
    `padded span ${paddedSpanDays}d must fit the ${CHUNK_SPAN_DAYS}d single-request cap`,
  );
});
