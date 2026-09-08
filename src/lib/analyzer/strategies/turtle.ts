import type { AnalysisContext, Candle, Outcome } from "../types";
import { eatDay } from "../time";

export type TurtleSide = "long" | "short";
export type TurtleSystem = "S1" | "S2";
export type TurtleResult = "WIN" | "LOSS";

export interface TurtleEvent {
  index: number;
  system: TurtleSystem;
  side: TurtleSide;
  unit: number;
  entry: number;
  initialStop: number;
  finalStop: number;
  exitLevel: number | undefined;
  outcome: TurtleResult | "OPEN";
  resolutionIndex?: number;
  resolutionPrice?: number;
  fillReason: string;
  exitReason?: string;
  unitsAtExit: number;
}

interface ActivePosition {
  key: string;
  system: TurtleSystem;
  side: TurtleSide;
  unitEntries: number[];
  eventIndexes: number[];
  stop: number;
  nextAdd: number;
  nextAddN: number;
  units: number;
  exitLookback: 10 | 20;
  entryDay: string;
}

interface HypotheticalSignal {
  side: TurtleSide;
  entry: number;
  stop: number;
  exitLookback: 10 | 20;
  startedAt: number;
  resolved?: TurtleResult;
}

interface TurtleState {
  positions: Map<string, ActivePosition>;
  lastS1Outcome: Record<TurtleSide, TurtleResult | undefined>;
  hypothetical: Record<TurtleSide, HypotheticalSignal[]>;
  events: Map<string, TurtleEvent>;
  lastSignalDay: Record<string, string | undefined>;
  ambiguousBreakouts: Set<number>;
}

const STATE_KEY = "turtle-engine-v1";
const MAX_UNITS_PER_MARKET = 4;

function getState(ctx: AnalysisContext): TurtleState {
  const existing = ctx.state.get(STATE_KEY) as TurtleState | undefined;
  if (existing) return existing;
  const state: TurtleState = {
    positions: new Map(),
    lastS1Outcome: { long: undefined, short: undefined },
    hypothetical: { long: [], short: [] },
    events: new Map(),
    lastSignalDay: {},
    ambiguousBreakouts: new Set(),
  };
  ctx.state.set(STATE_KEY, state);
  return state;
}

function priorDays(ctx: AnalysisContext, day: string): typeof ctx.daily {
  return ctx.daily.filter((d) => d.day < day);
}

const atrNCache = new WeakMap<AnalysisContext, Map<string, number | undefined>>();

function atrN(ctx: AnalysisContext, day: string): number | undefined {
  let perCtx = atrNCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    atrNCache.set(ctx, perCtx);
  }
  if (perCtx.has(day)) return perCtx.get(day);

  const ds = priorDays(ctx, day);
  let value: number | undefined;
  if (ds.length >= 20) {
    const trs: number[] = [];
    for (let i = 1; i < ds.length; i++) {
      const d = ds[i]!;
      const p = ds[i - 1]!;
      trs.push(Math.max(d.high - d.low, Math.abs(d.high - p.close), Math.abs(d.low - p.close)));
    }
    if (trs.length >= 20) {
      let v = trs.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
      for (let i = 20; i < trs.length; i++) v = (19 * v + trs[i]!) / 20;
      value = v > 0 ? v : undefined;
    }
  }
  perCtx.set(day, value);
  return value;
}

function dHigh(ctx: AnalysisContext, day: string, n: number): number | undefined {
  const ds = priorDays(ctx, day).slice(-n);
  return ds.length === n ? Math.max(...ds.map((d) => d.high)) : undefined;
}

function dLow(ctx: AnalysisContext, day: string, n: number): number | undefined {
  const ds = priorDays(ctx, day).slice(-n);
  return ds.length === n ? Math.min(...ds.map((d) => d.low)) : undefined;
}

function tickSize(ctx: AnalysisContext): number {
  if (typeof ctx.meta.turtle_tick_size === "number" && ctx.meta.turtle_tick_size > 0) {
    return ctx.meta.turtle_tick_size;
  }
  if (ctx.meta.turtle_tick_size) {
    const parsed = Number(ctx.meta.turtle_tick_size);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  // Fallback is deliberately explicit: metadata should provide the instrument's real minimum tick.
  // This only keeps older exports backwards-compatible.
  return 0.0001;
}

function unitsInMarket(state: TurtleState): number {
  let units = 0;
  for (const position of state.positions.values()) units += position.units;
  return units;
}

function eventKey(event: Pick<TurtleEvent, "index" | "system" | "side">): string { return `${event.index}:${event.system}:${event.side}`; }

function markEventOpen(state: TurtleState, index: number, system: TurtleSystem, side: TurtleSide, stop: number, units: number) {
  const event = state.events.get(eventKey({ index, system, side }));
  if (!event) return;
  event.finalStop = stop;
  event.unitsAtExit = units;
}

function resolvePosition(state: TurtleState, position: ActivePosition, result: TurtleResult, index: number, price: number, reason: string) {
  for (const eventIndex of position.eventIndexes) {
    const event = state.events.get(eventKey({ index: eventIndex, system: position.system, side: position.side }));
    if (!event) continue;
    event.finalStop = position.stop;
    event.unitsAtExit = position.units;
    event.outcome = result;
    event.resolutionIndex = index;
    event.resolutionPrice = price;
    event.exitReason = reason;
  }
  // BUGFIX: this was previously never wired up, so the S1 skip rule could
  // never engage — lastS1Outcome was only ever set by resolveHypotheticals,
  // which itself only runs for signals that were already skipped, an
  // unreachable bootstrap. A REAL S1 trade's outcome must also feed the skip
  // rule so the next same-direction S1 breakout knows whether to skip.
  if (position.system === "S1") {
    state.lastS1Outcome[position.side] = result;
  }
  state.positions.delete(position.key);
}

function resolveHypotheticals(ctx: AnalysisContext, state: TurtleState, candle: Candle) {
  const day = eatDay(candle.datetime);
  for (const side of ["long", "short"] as TurtleSide[]) {
    const list = state.hypothetical[side];
    for (const signal of list) {
      if (signal.resolved) continue;
      const exit = signal.exitLookback === 10 ? dLow(ctx, day, 10) : dLow(ctx, day, 20);
      const exitShort = signal.exitLookback === 10 ? dHigh(ctx, day, 10) : dHigh(ctx, day, 20);
      if (side === "long") {
        if (candle.low !== undefined && candle.low <= signal.stop) signal.resolved = "LOSS";
        else if (exit !== undefined && candle.low !== undefined && candle.low <= exit) signal.resolved = "WIN";
      } else {
        if (candle.high !== undefined && candle.high >= signal.stop) signal.resolved = "LOSS";
        else if (exitShort !== undefined && candle.high !== undefined && candle.high >= exitShort) signal.resolved = "WIN";
      }
      if (signal.resolved) state.lastS1Outcome[side] = signal.resolved;
    }
  }
}

function fillPrice(candle: Candle, trigger: number, side: TurtleSide): { price: number; reason: string } | undefined {
  if (candle.open === undefined || candle.high === undefined || candle.low === undefined) return undefined;
  if (side === "long" && candle.high >= trigger) {
    return { price: candle.open >= trigger ? candle.open : trigger, reason: candle.open >= trigger ? "gap/market fill above stop level" : "stop level filled" };
  }
  if (side === "short" && candle.low <= trigger) {
    return { price: candle.open <= trigger ? candle.open : trigger, reason: candle.open <= trigger ? "gap/market fill below stop level" : "stop level filled" };
  }
  return undefined;
}

function positionKey(system: TurtleSystem, side: TurtleSide): string {
  return `${system}:${side}`;
}

function processPosition(ctx: AnalysisContext, state: TurtleState, candle: Candle, position: ActivePosition, N: number): boolean {
  const day = eatDay(candle.datetime);
  const trailing = position.exitLookback === 10 ? dLow(ctx, day, 10) : dLow(ctx, day, 20);
  const trailingShort = position.exitLookback === 10 ? dHigh(ctx, day, 10) : dHigh(ctx, day, 20);

  if (position.side === "long") {
    if (candle.low !== undefined && candle.low <= position.stop) {
      resolvePosition(state, position, "LOSS", candle.index, position.stop, `2N unified stop hit; stop was re-anchored to most recent fill at ${position.stop}`);
      return true;
    }
    if (trailing !== undefined && candle.low !== undefined && candle.low <= trailing) {
      resolvePosition(state, position, "WIN", candle.index, trailing, `${position.exitLookback}-day trailing exit hit`);
      return true;
    }
  } else {
    if (candle.high !== undefined && candle.high >= position.stop) {
      resolvePosition(state, position, "LOSS", candle.index, position.stop, `2N unified stop hit; stop was re-anchored to most recent fill at ${position.stop}`);
      return true;
    }
    if (trailingShort !== undefined && candle.high !== undefined && candle.high >= trailingShort) {
      resolvePosition(state, position, "WIN", candle.index, trailingShort, `${position.exitLookback}-day trailing exit hit`);
      return true;
    }
  }

  // BUGFIX: this previously checked only this position's own unit count
  // (position.units), so S1-long and S2-long — separate ActivePosition
  // tracks — could each independently pyramid to MAX_UNITS_PER_MARKET,
  // totaling 8 units in one market. The source's single-market cap (4 units)
  // is a market-wide total, matching the same check runBreakout already uses
  // when opening a brand-new position.
  if (unitsInMarket(state) < MAX_UNITS_PER_MARKET) {
    const add = fillPrice(candle, position.nextAdd, position.side);
    if (add) {
      const actual = add.price;
      position.unitEntries.push(actual);
      position.eventIndexes.push(candle.index);
      position.units += 1;
      position.nextAddN = N;
      position.nextAdd = position.side === "long" ? actual + 0.5 * N : actual - 0.5 * N;
      position.stop = position.side === "long" ? actual - 2 * N : actual + 2 * N;
      state.events.set(eventKey({ index: candle.index, system: position.system, side: position.side }), {
        index: candle.index,
        system: position.system,
        side: position.side,
        unit: position.units,
        entry: actual,
        initialStop: position.stop,
        finalStop: position.stop,
        exitLevel: position.exitLookback === 10 ? trailing : trailingShort,
        outcome: "OPEN",
        fillReason: `pyramid unit ${position.units}: +0.5N from actual prior fill (${actual.toFixed(5)})`,
        unitsAtExit: position.units,
      });
      for (const eventIndex of position.eventIndexes) markEventOpen(state, eventIndex, position.system, position.side, position.stop, position.units);
    }
  }
  return false;
}

function breakoutCandidates(ctx: AnalysisContext, candle: Candle, system: TurtleSystem, day: string): Array<{ side: TurtleSide; trigger: number; filled: { price: number; reason: string } }> {
  if (candle.high === undefined || candle.low === undefined) return [];
  const lookback = system === "S1" ? 20 : 55;
  const high = dHigh(ctx, day, lookback);
  const low = dLow(ctx, day, lookback);
  const tick = tickSize(ctx);
  const longTrigger = system === "S1" ? (high === undefined ? undefined : high + tick) : high;
  const shortTrigger = system === "S1" ? (low === undefined ? undefined : low - tick) : low;
  if (longTrigger === undefined || shortTrigger === undefined) return [];
  const candidates: Array<{ side: TurtleSide; trigger: number; filled: { price: number; reason: string } }> = [];
  const longFill = fillPrice(candle, longTrigger, "long");
  if (longFill) candidates.push({ side: "long", trigger: longTrigger, filled: longFill });
  const shortFill = fillPrice(candle, shortTrigger, "short");
  if (shortFill) candidates.push({ side: "short", trigger: shortTrigger, filled: shortFill });
  return candidates;
}

function runBreakout(ctx: AnalysisContext, state: TurtleState, candle: Candle, system: TurtleSystem, N: number, day: string) {
  const candidates = breakoutCandidates(ctx, candle, system, day);
  // With OHLC data we cannot know which stop was hit first. Never manufacture
  // an ordering when both sides trigger on the same candle.
  if (candidates.length > 1) return;
  for (const candidate of candidates) {
    const side = candidate.side;
    const key = positionKey(system, side);
    const alreadyOpen = state.positions.has(key);
    if (alreadyOpen) continue;
    const lastDayKey = `${system}:${side}`;
    if (state.lastSignalDay[lastDayKey] === day) continue;
    const filled = candidate.filled;
    state.lastSignalDay[lastDayKey] = day;

    if (system === "S1" && state.lastS1Outcome[side] === "WIN") {
      const stop = side === "long" ? filled.price - 2 * N : filled.price + 2 * N;
      state.hypothetical[side].push({ side, entry: filled.price, stop, exitLookback: 10, startedAt: candle.index });
      continue;
    }

    if (unitsInMarket(state) >= MAX_UNITS_PER_MARKET) continue;

    const stop = side === "long" ? filled.price - 2 * N : filled.price + 2 * N;
    const position: ActivePosition = {
      key,
      system,
      side,
      unitEntries: [filled.price],
      eventIndexes: [candle.index],
      stop,
      nextAdd: side === "long" ? filled.price + 0.5 * N : filled.price - 0.5 * N,
      nextAddN: N,
      units: 1,
      exitLookback: system === "S1" ? 10 : 20,
      entryDay: day,
    };
    state.positions.set(key, position);
    const exitLevel = side === "long" ? dLow(ctx, day, position.exitLookback) : dHigh(ctx, day, position.exitLookback);
    state.events.set(eventKey({ index: candle.index, system, side }), {
      index: candle.index,
      system,
      side,
      unit: 1,
      entry: filled.price,
      initialStop: stop,
      finalStop: stop,
      exitLevel,
      outcome: "OPEN",
      fillReason: filled.reason,
      unitsAtExit: 1,
    });

    // A stop/trailing exit can happen on the fill candle. The source's order is
    // conservative here: stop is checked before trailing exit when both are touched.
    processPosition(ctx, state, candle, position, N);
  }
}

export function turtleRun(ctx: AnalysisContext, i: number): Outcome {
  const candle = ctx.candles[i]!;
  if (candle.high === undefined || candle.low === undefined) return { result: "FAIL", reason: "needs complete OHLC" };
  const day = eatDay(candle.datetime);
  const N = atrN(ctx, day);
  if (N === undefined) return { result: "FAIL", reason: "needs completed daily history for Wilder N(20)" };
  const state = getState(ctx);

  resolveHypotheticals(ctx, state, candle);
  for (const position of [...state.positions.values()]) processPosition(ctx, state, candle, position, N);
  const s1Candidates = breakoutCandidates(ctx, candle, "S1", day);
  const s2Candidates = breakoutCandidates(ctx, candle, "S2", day);

  // BUGFIX: ambiguity is only real WITHIN a single system's own long/short
  // triggers (that means the 20-day-high and 20-day-low stops both traded on
  // this candle, and we can't tell which came first). An S1 long trigger and
  // an unrelated S2 short trigger are independent unit tracks under the
  // spec's combined caps, not an ordering ambiguity — collapsing the whole
  // candle across systems silently discarded legitimate independent signals.
  let ambiguous = false;
  for (const [, candidates] of [["S1", s1Candidates], ["S2", s2Candidates]] as const) {
    const hasLong = candidates.some((candidate) => candidate.side === "long");
    const hasShort = candidates.some((candidate) => candidate.side === "short");
    if (hasLong && hasShort) {
      ambiguous = true;
      state.ambiguousBreakouts.add(candle.index);
    }
  }
  if (ambiguous) {
    const allCandidates = [...s1Candidates, ...s2Candidates];
    return {
      result: "FAIL",
      reason: "Turtle breakout is intrabar ambiguous: a single system's own long and short stop levels were both crossed on the same OHLC candle; no entry was manufactured for that system. Higher-resolution data is required to determine which stop traded first.",
      detail: [
        `Ambiguous candle: ${candle.datetime}`,
        `Long trigger(s): ${allCandidates.filter((candidate) => candidate.side === "long").map((candidate) => candidate.trigger.toFixed(5)).join(", ")}`,
        `Short trigger(s): ${allCandidates.filter((candidate) => candidate.side === "short").map((candidate) => candidate.trigger.toFixed(5)).join(", ")}`,
      ],
    };
  }
  runBreakout(ctx, state, candle, "S1", N, day);
  runBreakout(ctx, state, candle, "S2", N, day);

  // S1 and S2 can fire on the same candle in the same direction; include system+side in the key.
  const event = state.events.get(eventKey({ index: i, system: "S1", side: "long" }))
    ?? state.events.get(eventKey({ index: i, system: "S1", side: "short" }))
    ?? state.events.get(eventKey({ index: i, system: "S2", side: "long" }))
    ?? state.events.get(eventKey({ index: i, system: "S2", side: "short" }));
  if (!event) return { result: "FAIL", reason: "no canonical Turtle breakout, pyramid, or eligible unit-cap event" };
  if (event.unit > 1) {
    return {
      result: "FAIL",
      reason: `Turtle pyramid unit ${event.unit} filled at ${event.entry.toFixed(5)} (path event only; not counted as a new independent trade)`,
    };
  }
  const exit = event.exitLevel === undefined ? "dynamic trailing exit" : `${event.exitLevel}`;
  return {
    result: "PASS",
    reason: `${event.system} ${event.side} unit ${event.unit} fill at actual ${event.entry.toFixed(5)}; canonical skip/pyramiding/4-unit/re-anchored 2N stop state active; ${event.system === "S1" ? "10-day" : "20-day"} trailing exit (${exit}).`,
    entry: event.entry,
    sl: event.initialStop,
    tp: undefined,
    side: event.side,
    orderType: "stop",
    turtleSystem: event.system,
  };
}

export function turtleEvents(ctx: AnalysisContext): Map<string, TurtleEvent> {
  return ((ctx.state.get(STATE_KEY) as TurtleState | undefined)?.events ?? new Map());
}
