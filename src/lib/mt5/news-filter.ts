/**
 * Economic News & "Red Folder" High-Impact Event Protection Subsystem
 *
 * Prevents opening automated trades right before or during high-impact market news releases
 * (such as US Non-Farm Payrolls, CPI, FOMC Rate Decisions, ECB Statements, GDP, PPI, etc.)
 * which often cause sudden spread spikes, extreme volatility, and stop-loss slippage.
 */

export type NewsImpact = "HIGH" | "MEDIUM" | "LOW";

export interface EconomicNewsEvent {
  id: string;
  title: string;
  currency: string; // e.g. "USD", "EUR", "GBP", "JPY", "ALL"
  impact: NewsImpact; // "HIGH" = Red Folder 🔴, "MEDIUM" = Orange 🟠, "LOW" = Yellow 🟡
  datetime: string; // ISO 8601 string (e.g. "2026-09-27T12:30:00Z")
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface NewsFilterConfig {
  enabled: boolean;
  filterHighImpact: boolean; // Red Folder events
  filterMediumImpact: boolean; // Orange Folder events
  minutesBefore: number; // e.g., 30 minutes before release
  minutesAfter: number; // e.g., 30 minutes after release
  affectedCurrenciesOnly: boolean; // Only block symbols containing the news currency
}

export const DEFAULT_NEWS_FILTER_CONFIG: NewsFilterConfig = {
  enabled: true,
  filterHighImpact: true,
  filterMediumImpact: false,
  minutesBefore: 30,
  minutesAfter: 30,
  affectedCurrenciesOnly: true,
};

/**
 * Extracts the relevant currencies for a given financial trading symbol.
 * e.g., "XAU/USD" -> ["USD", "XAU"], "EUR/USD" -> ["EUR", "USD"]
 */
export function getCurrenciesForSymbol(symbol: string): string[] {
  const clean = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (clean.includes("XAU") || clean.includes("GOLD")) return ["USD", "XAU"];
  if (clean.includes("XAG") || clean.includes("SILVER")) return ["USD", "XAG"];
  if (clean.includes("BTC") || clean.includes("ETH") || clean.includes("SOL"))
    return ["USD", "CRYPTO"];
  if (clean.includes("USO") || clean.includes("BCO") || clean.includes("OIL"))
    return ["USD", "OIL"];

  // Standard 6-char Forex pairs (e.g., EURUSD, GBPJPY)
  if (clean.length === 6) {
    return [clean.slice(0, 3), clean.slice(3, 6)];
  }

  return ["USD"]; // default fallback
}

/**
 * Checks if a news event affects the given trading symbol.
 */
export function doesNewsAffectSymbol(news: EconomicNewsEvent, symbol: string): boolean {
  if (news.currency === "ALL") return true;
  const symCurrencies = getCurrenciesForSymbol(symbol);
  return symCurrencies.includes(news.currency.toUpperCase());
}

/**
 * Evaluates whether trading is currently restricted on a given symbol
 * due to an upcoming or recently released economic news event.
 */
export function checkNewsBlackout(params: {
  symbol: string;
  config: NewsFilterConfig;
  events: EconomicNewsEvent[];
  currentTimeMs?: number;
}): {
  isBlocked: boolean;
  reason?: string;
  activeEvent?: EconomicNewsEvent;
  minutesUntilOrSince?: number;
} {
  const { symbol, config, events, currentTimeMs = Date.now() } = params;

  if (!config.enabled) {
    return { isBlocked: false };
  }

  for (const event of events) {
    // Check impact filter
    if (event.impact === "HIGH" && !config.filterHighImpact) continue;
    if (event.impact === "MEDIUM" && !config.filterMediumImpact) continue;
    if (event.impact === "LOW") continue;

    // Check currency relevance
    if (config.affectedCurrenciesOnly && !doesNewsAffectSymbol(event, symbol)) {
      continue;
    }

    const eventTimeMs = Date.parse(event.datetime);
    if (!Number.isFinite(eventTimeMs)) continue;

    const diffMinutes = (eventTimeMs - currentTimeMs) / (60 * 1000);

    // Event is in the future within `minutesBefore`
    if (diffMinutes >= 0 && diffMinutes <= config.minutesBefore) {
      const mins = Math.max(1, Math.round(diffMinutes));
      return {
        isBlocked: true,
        reason: `🔴 Red Folder News Warning: [${event.currency}] "${event.title}" releases in ${mins} min(s). Trading is locked (${config.minutesBefore}m pre-news buffer).`,
        activeEvent: event,
        minutesUntilOrSince: mins,
      };
    }

    // Event was in the past within `minutesAfter`
    if (diffMinutes < 0 && Math.abs(diffMinutes) <= config.minutesAfter) {
      const mins = Math.max(1, Math.round(Math.abs(diffMinutes)));
      return {
        isBlocked: true,
        reason: `🟠 Post-News Volatility Cool-down: [${event.currency}] "${event.title}" was released ${mins} min(s) ago. Trading is locked (${config.minutesAfter}m post-news buffer).`,
        activeEvent: event,
        minutesUntilOrSince: -mins,
      };
    }
  }

  return { isBlocked: false };
}

/**
 * In-memory Economic News Cache & Calendar Provider
 */
export type CalendarStatus = "live" | "stale" | "unavailable";
const CACHE_MS = 15 * 60_000;
const MAX_AGE_MS = 60 * 60_000;

/** Server-side cache. A failed request never creates or updates events. */
export class EconomicNewsManager {
  private events: EconomicNewsEvent[] = [];
  private manualEvents: EconomicNewsEvent[] = [];
  private lastFetched = 0;
  private nextAttempt = 0;
  private failures = 0;
  private inFlight: Promise<void> | null = null;

  public getLastFetched(): number {
    return this.lastFetched;
  }
  public getStatus(now = Date.now()): CalendarStatus {
    if (!this.lastFetched) return "unavailable";
    return now - this.lastFetched <= MAX_AGE_MS ? "live" : "stale";
  }
  public getEvents(): EconomicNewsEvent[] {
    return [...this.events, ...this.manualEvents].map((e) => ({ ...e }));
  }
  public setManualEvents(events: EconomicNewsEvent[]) {
    if (
      !Array.isArray(events) ||
      events.length > 1000 ||
      events.some(
        (e) =>
          !e ||
          typeof e.id !== "string" ||
          typeof e.title !== "string" ||
          typeof e.currency !== "string" ||
          !["HIGH", "MEDIUM", "LOW"].includes(e.impact) ||
          typeof e.datetime !== "string" ||
          !Number.isFinite(Date.parse(e.datetime)),
      )
    )
      throw new Error("Invalid manual calendar events");
    this.manualEvents = events.map((e) => ({ ...e, currency: e.currency.toUpperCase() }));
  }
  public getUpcomingHighImpactEvents(withinHours = 24): EconomicNewsEvent[] {
    const now = Date.now();
    return this.getEvents().filter(
      (e) =>
        e.impact === "HIGH" &&
        Date.parse(e.datetime) >= now - 3600_000 &&
        Date.parse(e.datetime) <= now + withinHours * 3600_000,
    );
  }
  public setEvents(events: EconomicNewsEvent[]) {
    if (
      !Array.isArray(events) ||
      events.some(
        (e) =>
          !e ||
          typeof e.id !== "string" ||
          typeof e.title !== "string" ||
          typeof e.currency !== "string" ||
          !["HIGH", "MEDIUM", "LOW"].includes(e.impact) ||
          !Number.isFinite(Date.parse(e.datetime)),
      )
    )
      throw new Error("Invalid calendar events");
    this.events = events.map((e) => ({ ...e }));
    this.lastFetched = Date.now();
  }
  public async refresh(fetcher: typeof fetch = fetch): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (Date.now() < this.nextAttempt) return;
    this.inFlight = (async () => {
      let retryAfterMs = 0;
      try {
        const response = await fetcher("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          const retry = response.headers.get("Retry-After");
          if (retry) {
            const seconds = Number(retry);
            retryAfterMs = Number.isFinite(seconds)
              ? seconds * 1000
              : Math.max(0, Date.parse(retry) - Date.now());
            if (!Number.isFinite(retryAfterMs)) retryAfterMs = 0;
          }
          throw new Error(`Calendar HTTP ${response.status}`);
        }
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) throw new Error("Invalid calendar response");
        const events: EconomicNewsEvent[] = rows.map((row: Record<string, unknown>, i: number) => {
          if (
            typeof row["title"] !== "string" ||
            typeof row["country"] !== "string" ||
            typeof row["date"] !== "string" ||
            !Number.isFinite(Date.parse(row["date"])) ||
            typeof row["impact"] !== "string"
          )
            throw new Error("Invalid calendar row");
          const impact = row["impact"].toUpperCase();
          if (!["HIGH", "MEDIUM", "LOW", "HOLIDAY", "NON-ECONOMIC"].includes(impact))
            throw new Error("Invalid impact");
          return {
            id: `${row["date"]}-${row["country"]}-${i}`,
            title: row["title"],
            currency: row["country"].toUpperCase(),
            datetime: new Date(row["date"]).toISOString(),
            impact:
              impact === "HOLIDAY" || impact === "NON-ECONOMIC" ? "LOW" : (impact as NewsImpact),
            forecast: typeof row["forecast"] === "string" ? row["forecast"] : undefined,
            previous: typeof row["previous"] === "string" ? row["previous"] : undefined,
          };
        });
        this.setEvents(events);
        this.failures = 0;
        this.nextAttempt = Date.now() + CACHE_MS;
      } catch {
        this.failures++;
        this.nextAttempt =
          Date.now() +
          Math.min(
            24 * 60 * 60_000,
            Math.max(
              retryAfterMs,
              Math.min(60 * 60_000, 60_000 * 2 ** Math.min(this.failures - 1, 6)),
            ),
          );
      }
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}

export const newsManager = new EconomicNewsManager();
