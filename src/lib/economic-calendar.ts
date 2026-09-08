/**
 * Client-safe helpers for the economic calendar (Finnhub via /api/economic-calendar).
 * Credentials never leave the server.
 * Responses are schedule-only (no actual/surprise) to avoid look-ahead in backtests.
 */

export type CalendarEvent = {
  name: string;
  country: string;
  currency: string;
  impact: string;
  scheduledAt: string;
  estimate?: string | null;
  prev?: string | null;
};

export type EconomicCalendarResponse = {
  status: "ok" | "error";
  from?: string;
  to?: string;
  hours?: number;
  mode?: "live" | "historical";
  count?: number;
  events?: CalendarEvent[];
  byDay?: Record<string, CalendarEvent[]>;
  contextText?: string;
  message?: string;
  note?: string;
};

/** Live: upcoming high/medium impact US/EU/GB events (default next 48h). */
export async function requestEconomicCalendar(options?: {
  hours?: number;
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<EconomicCalendarResponse> {
  const params = new URLSearchParams();
  if (options?.hours != null) params.set("hours", String(options.hours));
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);
  const qs = params.toString();
  const response = await fetch(`/api/economic-calendar${qs ? `?${qs}` : ""}`, {
    method: "GET",
    signal: options?.signal,
  });
  const data = (await response.json().catch(() => ({}))) as EconomicCalendarResponse;
  if (!response.ok) {
    return {
      status: "error",
      message: data.message || `HTTP ${response.status}`,
    };
  }
  return data;
}

/** Historical range for backtests — schedule only, grouped by day. */
export async function requestHistoricalCalendar(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<EconomicCalendarResponse> {
  return requestEconomicCalendar({ from, to, signal });
}

/** Format one day's medium/high events for logs / day reports. */
export function formatDayNews(events: CalendarEvent[] | undefined): string {
  if (!events || events.length === 0) return "[NEWS]\n(none)";
  const lines = ["[NEWS — schedule only, no actuals]"];
  for (const e of events) {
    lines.push(
      `${e.impact.toUpperCase()} · ${e.currency} · ${e.name} @ ${e.scheduledAt}`,
    );
  }
  return lines.join("\n");
}
