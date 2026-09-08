/**
 * News / economic-calendar layer for the Gemini trade-selection layer.
 *
 * News is an INFORMATION TOOL: never a filter, never a strategy, never an
 * automatic reject. The provider interface is normalized so the provider can
 * be swapped without touching the selection architecture.
 *
 * Look-ahead rules (same as OHLC):
 *  - At decision time T (EAT local), an event scheduled after T may be listed
 *    with schedule-only fields (name, currency, impact, scheduledAt, forecast,
 *    previous) — this was publicly knowable at T.
 *  - `actual` is attached ONLY when the source marks the event released and
 *    the release time is at or before T. Finnhub gives no separate release
 *    timestamp; releasedAt is approximated as scheduledAt (documented), so an
 *    actual is never exposed before the event's own scheduled time.
 *  - Events beyond the configured horizon are excluded entirely.
 */

export type Impact = "low" | "medium" | "high";

export interface CalendarEvent {
  id: string;
  name: string;
  currency: string;
  impact: Impact;
  /** ISO-8601 UTC timestamp of the scheduled release. */
  scheduledAt: string;
  status: "scheduled" | "released";
  /** ISO-8601 UTC release time when the provider reports one (approximated = scheduledAt for Finnhub). */
  releasedAt?: string | undefined;
  actual?: string | undefined;
  forecast?: string | undefined;
  previous?: string | undefined;
}

/** What the model may see at decision time T. */
export interface VisibleEvent {
  id: string;
  name: string;
  currency: string;
  impact: Impact;
  scheduledAt: string;
  status: "scheduled" | "released";
  actual?: string | undefined;
  forecast?: string | undefined;
  previous?: string | undefined;
  minutesUntil?: number | undefined;
}

export interface VisibleNews {
  asOfUtc: string;
  upcoming: VisibleEvent[];
  recent: VisibleEvent[];
}

export const DEFAULT_NEWS_HORIZON_HOURS = 48;
export const DEFAULT_NEWS_LOOKBACK_HOURS = 24;
export const DEFAULT_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export const DEFAULT_IMPACTS: Impact[] = ["high", "medium"];

/** EAT local "YYYY-MM-DD HH:mm:ss" (or "YYYY-MM-DDTHH:mm:ss") -> ms epoch UTC. */
export function eatLocalToUtcMs(local: string): number {
  const norm = local.includes("T") ? local : local.replace(" ", "T");
  const withSec = norm.length === 16 ? `${norm}:00` : norm;
  return Date.parse(`${withSec}+03:00`);
}

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  EU: "EUR",
  GB: "GBP",
  JP: "JPY",
  CH: "CHF",
  AU: "AUD",
  CA: "CAD",
  NZ: "NZD",
  CN: "CNY",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  ZA: "ZAR",
  KE: "KES",
};

function normalizeImpact(raw: unknown): Impact {
  const s = String(raw ?? "").toLowerCase();
  if (s === "3" || s === "high") return "high";
  if (s === "2" || s === "medium" || s === "moderate") return "medium";
  return "low";
}

/** Normalize a Finnhub economic-calendar row into the internal CalendarEvent. */
export function normalizeFinnhubRow(row: Record<string, unknown>, index: number): CalendarEvent {
  const country = String(row["country"] ?? "").toUpperCase();
  const currency = COUNTRY_TO_CURRENCY[country] ?? (country || "???");
  const time = String(row["time"] ?? "");
  const scheduledAt = time.includes("T") ? time : time.replace(" ", "T");
  const iso = scheduledAt.endsWith("Z") ? scheduledAt : `${scheduledAt}Z`;
  const actual = row["actual"];
  const hasActual = actual !== undefined && actual !== null;
  return {
    id: `fh-${iso}-${String(row["event"] ?? "event").slice(0, 32)}-${index}`,
    name: String(row["event"] ?? "Unnamed event"),
    currency,
    impact: normalizeImpact(row["impact"]),
    scheduledAt: iso,
    // Finnhub marks releases only via the presence of `actual`; release time
    // is approximated as the scheduled time (never EARLIER than it).
    status: hasActual ? "released" : "scheduled",
    releasedAt: hasActual ? iso : undefined,
    actual: hasActual ? String(actual) : undefined,
    forecast:
      row["estimate"] !== undefined && row["estimate"] !== null
        ? String(row["estimate"])
        : undefined,
    previous: row["prev"] !== undefined && row["prev"] !== null ? String(row["prev"]) : undefined,
  };
}

export function normalizeFinnhubCalendar(payload: unknown): CalendarEvent[] {
  const rows = (payload as { economicCalendar?: unknown[] } | null | undefined)?.economicCalendar;
  // Malformed provider payloads must fail CLOSED, not silently become "no
  // news" (a run without news because the provider answered garbage must be
  // loud, not quiet). An EMPTY array is the one legitimate empty response.
  if (!Array.isArray(rows)) {
    throw new Error("finnhub response malformed: 'economicCalendar' missing or not an array");
  }
  return rows.map((row, i) => normalizeFinnhubRow(row as Record<string, unknown>, i));
}

/**
 * Project events into what is visible at decision time T (EAT local).
 * - upcoming: scheduled in (T, T+horizon]; schedule-only, actual stripped, minutesUntil attached.
 * - recent: scheduled within the lookback; actual attached only when released by T.
 */
export function visibleNews(
  events: CalendarEvent[],
  TLocal: string,
  options: {
    horizonHours?: number;
    lookbackHours?: number;
    currencies?: readonly string[];
    impacts?: readonly Impact[];
  } = {},
): VisibleNews {
  const horizonH = options.horizonHours ?? DEFAULT_NEWS_HORIZON_HOURS;
  const lookbackH = options.lookbackHours ?? DEFAULT_NEWS_LOOKBACK_HOURS;
  const currencies = options.currencies ?? DEFAULT_CURRENCIES;
  const impacts = options.impacts ?? DEFAULT_IMPACTS;
  const nowMs = eatLocalToUtcMs(TLocal);
  const upcoming: VisibleEvent[] = [];
  const recent: VisibleEvent[] = [];
  for (const e of events) {
    if (!currencies.includes(e.currency)) continue;
    if (!impacts.includes(e.impact)) continue;
    const schedMs = Date.parse(e.scheduledAt);
    const minutesUntil = (schedMs - nowMs) / 60000;
    if (minutesUntil > 0) {
      if (minutesUntil > horizonH * 60) continue;
      upcoming.push({
        id: e.id,
        name: e.name,
        currency: e.currency,
        impact: e.impact,
        scheduledAt: e.scheduledAt,
        status: "scheduled",
        forecast: e.forecast,
        previous: e.previous,
        minutesUntil: Math.round(minutesUntil),
      });
    } else {
      if (minutesUntil < -lookbackH * 60) continue;
      const released =
        e.status === "released" && e.releasedAt !== undefined && Date.parse(e.releasedAt) <= nowMs;
      recent.push({
        id: e.id,
        name: e.name,
        currency: e.currency,
        impact: e.impact,
        scheduledAt: e.scheduledAt,
        status: released ? "released" : "scheduled",
        actual: released ? e.actual : undefined,
        forecast: e.forecast,
        previous: e.previous,
        minutesUntil: Math.round(minutesUntil),
      });
    }
  }
  upcoming.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
  recent.sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1));
  return { asOfUtc: new Date(nowMs).toISOString(), upcoming, recent };
}

/* ------------------------------------------------------------------ *
 * Providers (normalized interface; swappable)                        *
 * ------------------------------------------------------------------ */

export interface NewsProvider {
  name: string;
  fetchCalendar(range: { fromUtc: string; toUtc: string }): Promise<CalendarEvent[]>;
}

export interface FetchLike {
  (
    input: string,
    init?: { headers?: Record<string, string> },
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

/**
 * Finnhub provider. The API key is supplied via the environment and NEVER
 * logged, serialized, or echoed. Without a key the provider fails closed.
 */
export function finnhubProvider(config: {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): NewsProvider {
  const fetchImpl =
    config.fetchImpl ??
    (async (input: string, init?: { headers?: Record<string, string> }) => {
      // Hard transport timeout: a hung provider must never stall a whole run.
      const signal = AbortSignal.timeout(config.timeoutMs ?? 15_000);
      const res = await fetch(input, { ...init, signal });
      return { ok: res.ok, status: res.status, json: () => res.json() as Promise<unknown> };
    });
  return {
    name: "finnhub",
    async fetchCalendar(range) {
      if (!config.apiKey)
        throw new Error("finnhub provider not configured (FINNHUB_API_KEY missing)");
      const from = range.fromUtc.slice(0, 10);
      const to = range.toUtc.slice(0, 10);
      const url = `${FINNHUB_BASE_URL}/calendar/economic?from=${from}&to=${to}&token=${encodeURIComponent(config.apiKey)}`;
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`finnhub request failed: HTTP ${res.status}`);
      const payload = await res.json();
      if ((payload as { error?: string } | null)?.error) {
        throw new Error(`finnhub request failed: ${(payload as { error: string }).error}`);
      }
      return normalizeFinnhubCalendar(payload);
    },
  };
}

/** Offline provider over a pre-downloaded JSON calendar file. */
export function fileProvider(events: CalendarEvent[]): NewsProvider {
  return {
    name: "file",
    async fetchCalendar() {
      return events;
    },
  };
}

/** Validate + normalize a JSON file into CalendarEvent[] (for --news-file). */
export function normalizeEventFile(payload: unknown): CalendarEvent[] {
  const raw = (payload as { events?: unknown[] } | null | undefined)?.events ?? payload;
  if (!Array.isArray(raw)) throw new Error("news file must be a JSON array or { events: [...] }");
  /** Bare local-looking timestamps are treated as UTC; offsets kept as-is. */
  const withZone = (s: string): string =>
    /Z$|[+-]\d{2}:\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z";
  return raw.map((row, i) => {
    const r = row as Record<string, unknown>;
    const impact = normalizeImpact(r["impact"]);
    const scheduledAt = String(r["scheduledAt"] ?? r["time"] ?? "");
    if (!scheduledAt) throw new Error(`news event #${i} missing scheduledAt`);
    const status = r["status"] === "released" ? "released" : "scheduled";
    const iso = withZone(scheduledAt);
    return {
      id: String(r["id"] ?? `file-${i}`),
      name: String(r["name"] ?? r["event"] ?? "Unnamed event"),
      currency: String(r["currency"] ?? r["country"] ?? "???").toUpperCase(),
      impact,
      scheduledAt: iso,
      status,
      releasedAt:
        r["releasedAt"] !== undefined
          ? withZone(String(r["releasedAt"]))
          : status === "released"
            ? iso
            : undefined,
      actual: r["actual"] !== undefined && r["actual"] !== null ? String(r["actual"]) : undefined,
      forecast: r["forecast"] !== undefined ? String(r["forecast"]) : undefined,
      previous: r["previous"] !== undefined ? String(r["previous"]) : undefined,
    };
  });
}
