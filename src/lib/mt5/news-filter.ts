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
class EconomicNewsManager {
  private events: EconomicNewsEvent[] = [];
  private lastFetched: number = 0;

  constructor() {
    this.seedRecurringCalendar();
  }

  public getLastFetched(): number {
    return this.lastFetched;
  }

  public getEvents(): EconomicNewsEvent[] {
    return [...this.events];
  }

  public getUpcomingHighImpactEvents(withinHours = 24): EconomicNewsEvent[] {
    const now = Date.now();
    const limit = now + withinHours * 3600 * 1000;
    return this.events.filter((e) => {
      const t = Date.parse(e.datetime);
      return e.impact === "HIGH" && t >= now - 3600 * 1000 && t <= limit;
    });
  }

  public setEvents(events: EconomicNewsEvent[]) {
    this.events = events;
    this.lastFetched = Date.now();
  }

  /**
   * Generates recurring real-world High Impact calendar schedule
   * (NFP, CPI, Fed Interest Rate Decisions, ECB, BOE, Retail Sales, GDP)
   * aligned with realistic market release times.
   */
  public seedRecurringCalendar() {
    const now = new Date();
    const generated: EconomicNewsEvent[] = [];

    // Key major news releases
    const templates = [
      {
        title: "USD Non-Farm Payrolls (NFP)",
        currency: "USD",
        impact: "HIGH" as const,
        hourUTC: 12,
        minute: 30,
        forecast: "185K",
        previous: "142K",
      },
      {
        title: "USD Consumer Price Index (CPI YoY)",
        currency: "USD",
        impact: "HIGH" as const,
        hourUTC: 12,
        minute: 30,
        forecast: "2.6%",
        previous: "2.9%",
      },
      {
        title: "USD FOMC Interest Rate Decision & Statement",
        currency: "USD",
        impact: "HIGH" as const,
        hourUTC: 18,
        minute: 0,
        forecast: "4.75%",
        previous: "5.00%",
      },
      {
        title: "USD Fed Chair Powell Press Conference",
        currency: "USD",
        impact: "HIGH" as const,
        hourUTC: 18,
        minute: 30,
        forecast: "—",
        previous: "—",
      },
      {
        title: "EUR ECB Monetary Policy Statement & Rate Decision",
        currency: "EUR",
        impact: "HIGH" as const,
        hourUTC: 12,
        minute: 15,
        forecast: "3.50%",
        previous: "3.75%",
      },
      {
        title: "GBP BOE Official Bank Rate Votes",
        currency: "GBP",
        impact: "HIGH" as const,
        hourUTC: 11,
        minute: 0,
        forecast: "5.00%",
        previous: "5.00%",
      },
      {
        title: "USD Core PPI (MoM)",
        currency: "USD",
        impact: "MEDIUM" as const,
        hourUTC: 12,
        minute: 30,
        forecast: "0.2%",
        previous: "0.3%",
      },
      {
        title: "USD Retail Sales (MoM)",
        currency: "USD",
        impact: "HIGH" as const,
        hourUTC: 12,
        minute: 30,
        forecast: "0.3%",
        previous: "0.1%",
      },
      {
        title: "USD Prelim GDP (QoQ)",
        currency: "USD",
        impact: "HIGH" as const,
        hourUTC: 12,
        minute: 30,
        forecast: "2.8%",
        previous: "3.0%",
      },
      {
        title: "USD Unemployment Claims",
        currency: "USD",
        impact: "MEDIUM" as const,
        hourUTC: 12,
        minute: 30,
        forecast: "218K",
        previous: "222K",
      },
    ];

    // Seed events spanning yesterday, today, and the next 7 days
    for (let dayOffset = -1; dayOffset <= 7; dayOffset++) {
      const eventDate = new Date(now);
      eventDate.setUTCDate(now.getUTCDate() + dayOffset);

      // Distribute templates across weekdays (skip weekends)
      const dayOfWeek = eventDate.getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const templateIndex = Math.abs((dayOffset + dayOfWeek * 2) % templates.length);
      const t = templates[templateIndex]!;

      eventDate.setUTCHours(t.hourUTC, t.minute, 0, 0);

      generated.push({
        id: `news-${eventDate.toISOString().slice(0, 10)}-${t.currency}-${t.hourUTC}`,
        title: t.title,
        currency: t.currency,
        impact: t.impact,
        datetime: eventDate.toISOString(),
        forecast: t.forecast,
        previous: t.previous,
      });
    }

    this.events = generated.sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
    );
    this.lastFetched = Date.now();
  }
}

export const newsManager = new EconomicNewsManager();
