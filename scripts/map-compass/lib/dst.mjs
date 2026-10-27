/**
 * G1 timezone contract for the Map/Compass Kaggle source.
 *
 * MEASURED, NOT ASSUMED (see docs/MAP-COMPASS-DATA-CONTRACT.md §2 and
 * artifacts/map-compass/dst-verification.json):
 *
 * `archive.zip` is stitched from TWO exports with DIFFERENT broker server
 * timezones. Both follow EU DST (last Sunday March -> last Sunday October),
 * but the base UTC offset differs by one hour:
 *
 *   EPOCH A  2004-06-11 .. 2011-05-06   broker = UTC+1 winter / UTC+2 summer
 *   EPOCH B  2011-05-09 .. 2026-01-30   broker = UTC+2 winter / UTC+3 summer
 *
 * The seam is price-continuous (2011-05-06 22:30 close 1495.00 ->
 * 2011-05-09 01:00 open 1494.25, a normal weekend gap), so it is a pure
 * timezone/session relabel, NOT a different price feed. The day boundary also
 * changes: epoch A days run 01:00-22:30 (44 bars), epoch B 01:00-23:30
 * (46 bars) — epoch A is missing the first hour of the trading day.
 *
 * Target convention is fixed EAT (UTC+3), matching src/lib/analyzer/time.ts.
 * Conversion to EAT is therefore:
 *
 *   EAT = broker_local + (EU summer ? 1h : 2h)   in epoch A
 *   EAT = broker_local + (EU summer ? 0h : 1h)   in epoch B
 *
 * Verification: scripts/map-compass/verify-dst.mjs scores this rule against
 * independent Dukascopy UTC M1 bid data. Coverage starts 2010-01 (Dukascopy
 * XAUUSD history does not go further back), so epoch A is verified for
 * 2010-01..2011-05 only; 2004-06..2009-12 is EXTRAPOLATED and flagged.
 */

const HOUR_MS = 60 * 60 * 1000;

/** First broker-local timestamp belonging to epoch B. Frozen at G1. */
export const EPOCH_B_START = "2011-05-09 01:00:00";

/** Last verified epoch-A date (Dukascopy coverage starts 2010-01-01). */
export const VERIFIED_FROM = "2010-01-01";

/** Last Sunday of a given UTC month (month is 1-based). */
export function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month, 0));
  return Date.UTC(year, month - 1, last.getUTCDate() - ((last.getUTCDay() + 7) % 7));
}

/** [startMs, endMs) of EU summer as UTC instants (01:00 UTC on each Sunday). */
export function euSummerBounds(year) {
  return [lastSunday(year, 3) + HOUR_MS, lastSunday(year, 10) + HOUR_MS];
}

/**
 * Is this calendar date in EU summer? Date-only by design: the series has NO
 * weekend bars, so the transition Sundays (where local times are ambiguous or
 * nonexistent) contain no candles. A pure date rule is exact.
 */
export function isEuSummerDate(year, month, day) {
  const dateMs = Date.UTC(year, month - 1, day);
  const [start, end] = euSummerBounds(year);
  return dateMs >= start && dateMs < end;
}

/** Parse "YYYY.MM.DD HH:mm" / "YYYY-MM-DD HH:mm[:ss]" into naive ms (UTC math). */
export function parseNaive(text) {
  const m = String(text)
    .trim()
    .match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== +y ||
    check.getUTCMonth() !== +mo - 1 ||
    check.getUTCDate() !== +d ||
    check.getUTCHours() !== +h ||
    check.getUTCMinutes() !== +mi
  )
    return undefined;
  return ms;
}

/** Format naive ms as the repo's canonical datetime (EAT wall clock, no offset). */
export function formatNaive(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

const EPOCH_B_START_MS = parseNaive(EPOCH_B_START);

/**
 * Which timezone epoch does this broker-local timestamp belong to?
 * Numeric comparison — a string comparison against a boundary carrying a
 * `:00` seconds suffix silently misclassifies the exact boundary bar.
 */
export function epochOf(text) {
  const ms = parseNaive(text);
  if (ms === undefined) return undefined;
  return ms < EPOCH_B_START_MS ? "A" : "B";
}

/**
 * Convert a Kaggle broker-local timestamp to fixed EAT (UTC+3) wall clock.
 * Returns canonical "YYYY-MM-DD HH:MM:SS". Pure function of its own argument —
 * no later bars, no global state: this is a causality requirement.
 */
export function brokerLocalToEat(text) {
  const naive = parseNaive(text);
  if (naive === undefined) return undefined;
  const d = new Date(naive);
  const summer = isEuSummerDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const hours = epochOf(text) === "A" ? (summer ? 1 : 2) : summer ? 0 : 1;
  return formatNaive(naive + hours * HOUR_MS);
}

/** EAT session windows, copied from src/lib/analyzer/time.ts (keep in sync). */
export const SESSION_WINDOWS_EAT = Object.freeze({
  asian: { start: 1 * 60, end: 10 * 60 + 59 },
  london: { start: 11 * 60, end: 15 * 60 + 59 },
  ny: { start: 16 * 60, end: 24 * 60 + 59 },
});

/**
 * Session of a canonical EAT datetime. Mirrors `sessionOf` in
 * src/lib/analyzer/time.ts EXACTLY: that function checks asian then london and
 * falls through to "ny" for everything else — including the 00:00-00:59 tail
 * that belongs to the previous NY session. Returning undefined here would
 * silently drop the first hour of the trading day from every cost bucket.
 */
export function sessionOfEat(canonical) {
  const m = /^\d{4}-\d{2}-\d{2} (\d{2}):(\d{2})/.exec(String(canonical));
  if (!m) return undefined;
  const mins = +m[1] * 60 + +m[2];
  if (mins >= SESSION_WINDOWS_EAT.asian.start && mins <= SESSION_WINDOWS_EAT.asian.end)
    return "asian";
  if (mins >= SESSION_WINDOWS_EAT.london.start && mins <= SESSION_WINDOWS_EAT.london.end)
    return "london";
  return "ny";
}
