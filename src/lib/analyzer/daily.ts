import { CRABEL_ORB_WINDOW_MINUTES } from "@/lib/strategies/crabel-orb";
import {
  SESSION_WINDOWS_EAT,
  eatDay,
  eatParts,
  minutesIntoSession,
  sessionOf,
} from "./time";
import type { Candle } from "./types";

export interface RangeWindow {
  high: number;
  low: number;
  /** First / last candle index that contributed to the window. */
  start: number;
  end: number;
}

export interface DayAggregate extends RangeWindow {
  day: string;
  open: number;
  close: number;
}

export interface OpeningRange extends RangeWindow {
  day: string;
  session: string;
  /** First candle index strictly after the opening window closed. */
  afterWindow: number;
}

function usable(c: Candle | undefined): boolean {
  return !!c && !c.invalid && c.open !== undefined && c.high !== undefined && c.low !== undefined && c.close !== undefined;
}

/** Daily H/L/C aggregated on the EAT calendar day — the pivot reset we define. */
export function dailyAggregates(candles: Candle[]): DayAggregate[] {
  const out: DayAggregate[] = [];
  let current: DayAggregate | undefined;
  for (const c of candles) {
    if (!usable(c)) continue;
    const day = eatDay(c.datetime);
    if (!current || current.day !== day) {
      current = { day, open: c.open!, high: c.high!, low: c.low!, close: c.close!, start: c.index, end: c.index };
      out.push(current);
    } else {
      current.high = Math.max(current.high, c.high!);
      current.low = Math.min(current.low, c.low!);
      current.close = c.close!;
      current.end = c.index;
    }
  }
  return out;
}

/** Prior EAT day's aggregate relative to the day containing bar `i`. */
export function priorDay(daily: DayAggregate[], candle: Candle): DayAggregate | undefined {
  const day = eatDay(candle.datetime);
  let previous: DayAggregate | undefined;
  for (const agg of daily) {
    if (agg.day === day) return previous;
    previous = agg;
  }
  return undefined;
}

export interface ClassicPivots {
  pp: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
}

/** Classic pivots (the one method used everywhere in this analyzer). */
export function classicPivots(d: DayAggregate): ClassicPivots {
  const pp = (d.high + d.low + d.close) / 3;
  const range = d.high - d.low;
  return {
    pp,
    r1: 2 * pp - d.low,
    s1: 2 * pp - d.high,
    r2: pp + range,
    s2: pp - range,
  };
}

/** Asian-session range (EAT window) keyed by EAT day. */
export function asianRanges(candles: Candle[]): Map<string, RangeWindow> {
  const map = new Map<string, RangeWindow>();
  for (const c of candles) {
    if (!usable(c)) continue;
    if ((c.session ?? sessionOf(c.datetime)) !== "asian") continue;
    const day = eatDay(c.datetime);
    const existing = map.get(day);
    if (!existing) {
      map.set(day, { high: c.high!, low: c.low!, start: c.index, end: c.index });
    } else {
      existing.high = Math.max(existing.high, c.high!);
      existing.low = Math.min(existing.low, c.low!);
      existing.end = c.index;
    }
  }
  return map;
}

/**
 * The source-of-truth reference is explicit that Crabel's book does not pin
 * an opening-range window length — it's an implementer's choice (15/30/60
 * minutes are all cited as plausible). This project chooses 30 minutes as
 * its documented convention (see FIXES_APPLIED.md), not a value drawn from
 * any primary source. Only the london and ny sessions get an opening range
 * here — asian is intentionally excluded (see asianRanges, which computes a
 * full-session range, a different construct entirely).
 */
export const OPENING_WINDOW_MINUTES = CRABEL_ORB_WINDOW_MINUTES;

export function openingRangeKey(day: string, session: string): string {
  return `${day}|${session}`;
}

function previousEatDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ms)) return day;
  return new Date(ms - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * EAT day on which a candle's session OPENED. The NY session runs
 * 16:00-00:59 EAT, so its 00:00-00:59 tail-hour candles belong to the session
 * that opened on the previous EAT calendar day. Keying those tail candles to
 * their calendar day pointed them at a range that only opens 15+ hours in
 * their future, making the last NY hour structurally untradeable.
 */
export function openingSessionDay(datetime: string, session: string): string {
  const day = eatDay(datetime);
  if (session !== "ny") return day;
  const parts = eatParts(datetime);
  if (!parts) return day;
  if (parts.minutesOfDay < SESSION_WINDOWS_EAT["ny"]!.start) {
    return previousEatDay(day);
  }
  return day;
}

/**
 * First `M` minutes of the london / ny session on each EAT day. `afterWindow`
 * is the first bar that may legitimately break the range (no lookahead).
 */
export function openingRanges(
  candles: Candle[],
  windowMinutes = OPENING_WINDOW_MINUTES,
): Map<string, OpeningRange> {
  const map = new Map<string, OpeningRange>();
  for (const c of candles) {
    if (!usable(c)) continue;
    const session = c.session ?? sessionOf(c.datetime);
    if (session !== "london" && session !== "ny") continue;
    const elapsed = minutesIntoSession(c.datetime, session);
    if (elapsed === undefined) continue;
    const day = openingSessionDay(c.datetime, session);
    const key = openingRangeKey(day, session);
    const existing = map.get(key);
    if (elapsed < windowMinutes) {
      if (!existing) {
        map.set(key, {
          day,
          session,
          high: c.high!,
          low: c.low!,
          start: c.index,
          end: c.index,
          afterWindow: c.index + 1,
        });
      } else {
        existing.high = Math.max(existing.high, c.high!);
        existing.low = Math.min(existing.low, c.low!);
        existing.end = c.index;
        existing.afterWindow = c.index + 1;
      }
    }
  }
  return map;
}

export function openingRangeFor(
  ranges: Map<string, OpeningRange>,
  candle: Candle,
): OpeningRange | undefined {
  const session = candle.session ?? sessionOf(candle.datetime);
  if (!session) return undefined;
  return ranges.get(openingRangeKey(openingSessionDay(candle.datetime, session), session));
}
