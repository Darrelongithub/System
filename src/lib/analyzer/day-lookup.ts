/**
 * Prior-completed-day lookups over the analysis context's day aggregates.
 *
 * `ctx.daily` is a day-ascending array of aggregates. The strategies only ever
 * ask for the most recent day strictly before a given day (or the last N such
 * days), but they used to ask with `ctx.daily.filter((d) => d.day < day)`,
 * which walks the whole history and allocates a fresh array once per candle per
 * strategy. On a multi-year replay that is hundreds of millions of comparisons
 * plus a matching GC storm — a straight O(candles × days) term on the UI
 * thread.
 *
 * These helpers answer the same questions with a binary search over the day
 * keys. The semantics of the replaced code are preserved exactly:
 * `filter(...).at(-1)` means "the LAST element in ARRAY ORDER that satisfies
 * the predicate", so an array that is not day-ascending falls back to the
 * original linear scan rather than silently returning a different day.
 */

interface DaySortState {
  days: string[];
  ascending: boolean;
}

const sortCache = new WeakMap<readonly { day: string }[], DaySortState>();

function sortState(rows: readonly { day: string }[]): DaySortState {
  let state = sortCache.get(rows);
  if (!state) {
    const days = rows.map((row) => row.day);
    let ascending = days.every((day) => typeof day === "string");
    for (let i = 1; ascending && i < days.length; i++) {
      if (!(days[i - 1]! <= days[i]!)) ascending = false;
    }
    state = { days, ascending };
    sortCache.set(rows, state);
  }
  return state;
}

/**
 * Index of the last element whose day is strictly before `day`, or -1.
 * Identical to `rows.filter((r) => r.day < day).at(-1)` on a day-ascending array.
 */
export function lastDayBeforeIndex(rows: readonly { day: string }[], day: string): number {
  const { days, ascending } = sortState(rows);
  if (!ascending) {
    let found = -1;
    for (let i = 0; i < rows.length; i++) if (rows[i]!.day < day) found = i;
    return found;
  }
  let lo = 0;
  let hi = days.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid]! < day) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** The most recent completed day strictly before `day`, or undefined. */
export function lastDayBefore<T extends { day: string }>(
  rows: readonly T[],
  day: string,
): T | undefined {
  const idx = lastDayBeforeIndex(rows, day);
  return idx < 0 ? undefined : rows[idx];
}

/** Every day strictly before `day`, oldest → newest (`filter(r => r.day < day)`). */
export function daysBefore<T extends { day: string }>(rows: readonly T[], day: string): T[] {
  if (!sortState(rows).ascending) return rows.filter((row) => row.day < day);
  const idx = lastDayBeforeIndex(rows, day);
  return idx < 0 ? [] : rows.slice(0, idx + 1);
}

/**
 * The last `n` days strictly before `day`, oldest → newest (`filter(...).slice(-n)`).
 *
 * `slice(-n)` is reproduced exactly, including its quirk for non-positive n:
 * `-0` is `0`, so n = 0 keeps the whole filtered list rather than none of it.
 */
export function daysBeforeTail<T extends { day: string }>(
  rows: readonly T[],
  day: string,
  n: number,
): T[] {
  // `slice(-n)` start rule, applied to the filtered list's length.
  const startOf = (length: number) => (n > 0 ? Math.max(0, length - n) : n === 0 ? 0 : -n);
  if (!sortState(rows).ascending) {
    const filtered = rows.filter((row) => row.day < day);
    return filtered.slice(startOf(filtered.length));
  }
  const idx = lastDayBeforeIndex(rows, day);
  if (idx < 0) return [];
  return rows.slice(Math.min(startOf(idx + 1), idx + 1), idx + 1);
}

/** Index of the first element for exactly `day`, or -1 (`findIndex(d => d.day === day)`). */
export function indexOfDay(rows: readonly { day: string }[], day: string): number {
  const { days, ascending } = sortState(rows);
  if (!ascending) return rows.findIndex((row) => row.day === day);
  let lo = 0;
  let hi = days.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid]! < day) lo = mid + 1;
    else {
      if (days[mid]! === day) ans = mid;
      hi = mid - 1;
    }
  }
  return ans;
}
