import type { RawCandle } from "./types";

const MINUTE_MS = 60_000;
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const LONDON_ZONE = "Europe/London";
const NEW_YORK_ZONE = "America/New_York";

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = zonedFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    zonedFormatters.set(zone, formatter);
  }
  return formatter;
}

export function parseEatDatetime(value: string): number {
  const match = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) throw new Error(`invalid EAT wall-clock timestamp: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`invalid EAT wall-clock timestamp: ${value}`);
  }
  const utcAsWallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utcAsWallClock);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`invalid EAT calendar date: ${value}`);
  }
  return utcAsWallClock - EAT_OFFSET_MS;
}

export function formatEatDatetime(epochMs: number): string {
  const date = new Date(epochMs + EAT_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function dateParts(date: string): { year: number; month: number; day: number; weekday: number } {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`invalid ISO calendar date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw new Error(`invalid ISO calendar date: ${date}`);
  }
  return { year, month, day, weekday: value.getUTCDay() };
}

export function addCalendarDays(date: string, count: number): string {
  const { year, month, day } = dateParts(date);
  const value = new Date(Date.UTC(year, month - 1, day + count));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function weekdayDates(startDate: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 10_000) {
    throw new Error("weekdays must be an integer between 1 and 10000");
  }
  const first = dateParts(startDate);
  if (first.weekday === 0 || first.weekday === 6) {
    throw new Error("startDate must be a Monday-Friday EAT calendar date");
  }
  const output: string[] = [];
  let current = startDate;
  while (output.length < count) {
    const weekday = dateParts(current).weekday;
    if (weekday >= 1 && weekday <= 5) output.push(current);
    current = addCalendarDays(current, 1);
  }
  return output;
}

export function localHalfHourSlot(epochMs: number, zone: string): number {
  const parts = formatterFor(zone).formatToParts(new Date(epochMs));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error(`cannot resolve ${zone} time`);
  return hour * 2 + (minute >= 30 ? 1 : 0);
}

export function exchangeSlots(epochMs: number): { london: number; newYork: number } {
  return {
    london: localHalfHourSlot(epochMs, LONDON_ZONE),
    newYork: localHalfHourSlot(epochMs, NEW_YORK_ZONE),
  };
}

export function rawCandleTime(epochMs: number): Pick<RawCandle, "date" | "minuteOfDay" | "weekday"> {
  const eat = new Date(epochMs + EAT_OFFSET_MS);
  const date = `${eat.getUTCFullYear()}-${String(eat.getUTCMonth() + 1).padStart(2, "0")}-${String(eat.getUTCDate()).padStart(2, "0")}`;
  return {
    date,
    minuteOfDay: eat.getUTCHours() * 60 + eat.getUTCMinutes(),
    weekday: eat.getUTCDay(),
  };
}

export function eatEpochForDateSlot(date: string, minuteOfDay: number): number {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) {
    throw new Error(`invalid minute-of-day slot: ${minuteOfDay}`);
  }
  const { year, month, day } = dateParts(date);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Date.UTC(year, month - 1, day, hour, minute) - EAT_OFFSET_MS;
}

export function minutesBetween(leftEpochMs: number, rightEpochMs: number): number {
  return (rightEpochMs - leftEpochMs) / MINUTE_MS;
}
