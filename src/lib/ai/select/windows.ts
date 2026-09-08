/**
 * Decision-window engine for the Gemini trade-selection layer.
 *
 * Instead of one model call per deterministic trade, decisions happen at
 * configurable timestamps T (EAT local "YYYY-MM-DD HH:mm:ss"). At each T the
 * candidate set is rebuilt from trades actionable at that exact moment.
 * Window shapes are fully configurable: fixed clock times, every-N-hours,
 * session opens, or explicit timestamps.
 */

export type WindowConfig =
  | { kind: "times"; times: string[] } // EAT "HH:mm" entries, e.g. ["06:00","12:00","18:00"]
  | { kind: "every"; hours: number } // decision every N hours from 00:00 EAT
  | { kind: "sessions" } // session opens: 01:00 (asian), 11:00 (london), 16:00 (ny) EAT
  | { kind: "explicit"; timestamps: string[] }; // explicit EAT datetimes

export const SESSION_OPEN_TIMES = ["01:00", "11:00", "16:00"] as const;

const TIME_RE = /^(\d{2}):(\d{2})$/;

function normalizeTimes(times: string[]): string[] {
  const out: string[] = [];
  for (const t of times) {
    const m = TIME_RE.exec(t.trim());
    if (!m) throw new Error(`invalid window time "${t}" (expected HH:mm)`);
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) throw new Error(`invalid window time "${t}" (out of range)`);
    out.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return [...new Set(out)].sort();
}

/** Clock-time grid (EAT "HH:mm") implied by the config. */
export function clockTimesOf(config: WindowConfig): string[] | undefined {
  switch (config.kind) {
    case "times":
      return normalizeTimes(config.times);
    case "every": {
      const hours = config.hours;
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
        throw new Error(`invalid --every ${hours} (expected integer 1..24)`);
      }
      const out: string[] = [];
      for (let h = 0; h < 24; h += hours) out.push(`${String(h).padStart(2, "0")}:00`);
      return out;
    }
    case "sessions":
      return [...SESSION_OPEN_TIMES];
    case "explicit":
      return undefined;
  }
}

export function windowLabel(config: WindowConfig): string {
  switch (config.kind) {
    case "times":
      return `times(${normalizeTimes(config.times).join(",")})`;
    case "every":
      return `every-${config.hours}h`;
    case "sessions":
      return "sessions";
    case "explicit":
      return `explicit(${config.timestamps.length})`;
  }
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

/**
 * Enumerate decision timestamps across the candle range, in chronological
 * order. Days come from the data itself (days with no candles yield no
 * timestamps); explicit timestamps are validated and deduped.
 */
export function decisionTimestamps(candleDatetimes: string[], config: WindowConfig): string[] {
  if (config.kind === "explicit") {
    const out: string[] = [];
    for (const raw of config.timestamps) {
      const t = raw.trim().replace("T", " ");
      if (!DATETIME_RE.test(t)) throw new Error(`invalid explicit timestamp "${raw}"`);
      const full = t.length === 16 ? `${t}:00` : t;
      out.push(full);
    }
    return [...new Set(out)].sort();
  }
  const times = clockTimesOf(config);
  if (!times) throw new Error("unreachable: clock grid missing");
  const days: string[] = [];
  let lastDay = "";
  for (const dt of candleDatetimes) {
    const day = dt.slice(0, 10);
    if (day !== lastDay) {
      days.push(day);
      lastDay = day;
    }
  }
  const out: string[] = [];
  for (const day of days) {
    for (const t of times) out.push(`${day} ${t}:00`);
  }
  return out.sort();
}
