/** Pure risk/time primitives. EAT has a fixed UTC+03:00 offset. */
export function eatParts(nowMs: number) {
  const d = new Date(nowMs + 3 * 3600_000);
  return {
    day: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function entryTimeBlock(
  nowMs: number,
  rolloverEnabled: boolean,
  rolloverStart: number,
  rolloverEnd: number,
  fridayEnabled: boolean,
  fridayClose: number,
): string | null {
  const { weekday, minute } = eatParts(nowMs);
  const rollover =
    rolloverStart <= rolloverEnd
      ? minute >= rolloverStart && minute < rolloverEnd
      : minute >= rolloverStart || minute < rolloverEnd;
  if (rolloverEnabled && rollover) return "rollover blackout";
  if (fridayEnabled && weekday === 5 && minute >= Math.max(0, fridayClose - 120))
    return "Friday weekend gap blackout";
  if (fridayEnabled && weekday === 6) return "weekend blackout";
  return null;
}

export interface RiskSnapshot {
  day: string;
  dayBaseline: number;
  totalBaseline: number;
  dailyLocked: boolean;
  totalLocked: boolean;
  lossStreak: number;
  cooldownUntil: number;
  realizedR: number;
}

export function observeEquity(
  state: RiskSnapshot | null,
  nowMs: number,
  equity: number,
  balance: number,
  maxDailyLossPct: number,
  maxTotalDrawdownPct: number,
  maxDailyLossR: number,
): RiskSnapshot {
  if (!Number.isFinite(equity) || !Number.isFinite(balance) || equity <= 0 || balance <= 0)
    throw new Error("Invalid account equity or balance");
  const day = eatParts(nowMs).day;
  const baseline = Math.max(equity, balance);
  const current: RiskSnapshot = state
    ? { ...state }
    : {
        day,
        dayBaseline: baseline,
        totalBaseline: baseline,
        dailyLocked: false,
        totalLocked: false,
        lossStreak: 0,
        cooldownUntil: 0,
        realizedR: 0,
      };
  if (current.day !== day) {
    current.day = day;
    current.dayBaseline = baseline;
    current.dailyLocked = false;
    current.realizedR = 0;
  }
  current.dayBaseline = Math.max(current.dayBaseline, equity, balance);
  current.totalBaseline = Math.max(current.totalBaseline, equity, balance);
  if (maxDailyLossPct > 0 && equity <= current.dayBaseline * (1 - maxDailyLossPct / 100))
    current.dailyLocked = true;
  if (maxDailyLossR < 0 && current.realizedR <= maxDailyLossR) current.dailyLocked = true;
  if (maxTotalDrawdownPct > 0 && equity <= current.totalBaseline * (1 - maxTotalDrawdownPct / 100))
    current.totalLocked = true;
  return current;
}
