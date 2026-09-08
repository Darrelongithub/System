import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ensureServerEnv } from "@/lib/server-env";

/**
 * Finnhub economic calendar → context layer only (never a trade signal).
 * High/medium impact events for US / EU / GB that matter for XAU/USD & majors.
 */

const QuerySchema = z.object({
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(), // YYYY-MM-DD
  hours: z.coerce.number().min(1).max(168).optional(), // look-ahead window
});

const RELEVANT_COUNTRIES = new Set([
  "US",
  "EU",
  "GB",
  "United States",
  "Eurozone",
  "United Kingdom",
]);
const RELEVANT_IMPACT = new Set(["high", "medium"]);

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUTC(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CalendarEvent = {
  name: string;
  country: string;
  currency: string;
  impact: "high" | "medium" | "low" | string;
  scheduledAt: string;
  estimate?: string | null;
  prev?: string | null;
  // actual is intentionally omitted from strategy-facing output until after the event
};

function normalizeImpact(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase();
  if (s === "high" || s === "3") return "high";
  if (s === "medium" || s === "2") return "medium";
  if (s === "low" || s === "1") return "low";
  return s || "unknown";
}

function countryToCurrency(country: string): string {
  const c = country.toUpperCase();
  if (c === "US" || c.includes("UNITED STATES")) return "USD";
  if (c === "EU" || c.includes("EURO")) return "EUR";
  if (c === "GB" || c.includes("UNITED KINGDOM") || c.includes("UK")) return "GBP";
  return country;
}

export async function fetchCalendar(from: string, to: string): Promise<CalendarEvent[]> {
  const key = process.env["FINNHUB_API_KEY"];
  if (!key) {
    throw new Error("FINNHUB_API_KEY is not configured");
  }

  const params = new URLSearchParams({ from, to, token: key });
  const url = `https://finnhub.io/api/v1/calendar/economic?${params.toString()}`;
  const response = await fetch(url);
  const data: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Finnhub calendar failed (${response.status}): ${String(data?.error ?? data?.message ?? "").slice(0, 200)}`,
    );
  }

  const rows: any[] = Array.isArray(data?.economicCalendar)
    ? data.economicCalendar
    : Array.isArray(data)
      ? data
      : [];

  const events: CalendarEvent[] = [];
  for (const row of rows) {
    const impact = normalizeImpact(row.impact);
    if (!RELEVANT_IMPACT.has(impact)) continue;

    const country = String(row.country ?? row.countryCode ?? "").trim();
    if (!country) continue;
    const countryOk =
      RELEVANT_COUNTRIES.has(country) ||
      RELEVANT_COUNTRIES.has(country.toUpperCase()) ||
      /united states|eurozone|united kingdom|\bUK\b|\bUS\b|\bEU\b/i.test(country);
    if (!countryOk) continue;

    const scheduledAt = String(row.time ?? row.eventTime ?? row.date ?? "").trim();
    if (!scheduledAt) continue;

    // Schedule-only: never include actual/surprise (avoids look-ahead in backtests).
    events.push({
      name: String(row.event ?? row.name ?? "Economic event").trim(),
      country,
      currency: countryToCurrency(country),
      impact,
      scheduledAt,
      estimate: row.estimate != null ? String(row.estimate) : null,
      prev:
        row.prev != null ? String(row.prev) : row.previous != null ? String(row.previous) : null,
    });
  }

  // Soonest first
  events.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return events;
}

/** Human-readable context lines for Gemini / UI. */
export function formatNewsContext(events: CalendarEvent[], now = new Date()): string {
  if (events.length === 0) {
    return "[NEWS CONTEXT]\nNo high/medium-impact US/EU/GB events in the requested window.";
  }

  const lines = ["[NEWS CONTEXT — risk layer only, not a trade signal]"];
  for (const e of events) {
    const when = new Date(e.scheduledAt);
    const mins = Math.round((when.getTime() - now.getTime()) / 60_000);
    let timing: string;
    if (!Number.isFinite(mins)) {
      timing = e.scheduledAt;
    } else if (mins < 0) {
      timing = `${Math.abs(mins)} min ago`;
    } else if (mins < 60) {
      timing = `in ${mins} min`;
    } else {
      const hours = Math.round(mins / 60);
      timing = `in ~${hours}h`;
    }
    lines.push(
      `${e.impact.toUpperCase()} · ${e.currency} · ${e.name} · ${timing} (${e.scheduledAt})`,
    );
  }
  return lines.join("\n");
}

/** Server-side helper used by /api/analysis to inject news context into Gemini. */
export async function loadUpcomingNews(hours = 48): Promise<{
  events: CalendarEvent[];
  contextText: string;
}> {
  const from = todayUTC();
  const to = addDaysUTC(from, Math.max(1, Math.ceil(hours / 24)));
  const events = await fetchCalendar(from, to);
  const now = new Date();
  const horizonMs = hours * 60 * 60 * 1000;
  const filtered = events.filter((e) => {
    const t = new Date(e.scheduledAt).getTime();
    if (!Number.isFinite(t)) return true;
    const delta = t - now.getTime();
    return delta > -30 * 60 * 1000 && delta <= horizonMs;
  });
  return { events: filtered, contextText: formatNewsContext(filtered, now) };
}

async function handleGet({ request }: { request: Request }) {
  const url = new URL(request.url);
  return handleCalendar({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    hours: url.searchParams.get("hours") ?? undefined,
  });
}

async function handlePost({ request }: { request: Request }) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const o = (body ?? {}) as Record<string, unknown>;
  return handleCalendar({
    from: typeof o["from"] === "string" ? o["from"] : undefined,
    to: typeof o["to"] === "string" ? o["to"] : undefined,
    hours: o["hours"],
  });
}

async function handleCalendar(params: { from?: string; to?: string; hours?: unknown }) {
  await ensureServerEnv(); // .env defaults; platform env wins; edge-safe no-op without fs
  try {
    const parsed = QuerySchema.safeParse(params);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hours = parsed.data.hours ?? 48;
    const from = parsed.data.from ?? todayUTC();
    const to = parsed.data.to ?? addDaysUTC(from, Math.max(1, Math.ceil(hours / 24)));

    const events = await fetchCalendar(from, to);
    const now = new Date();
    const historical = Boolean(parsed.data.from && parsed.data.to);
    const horizonMs = hours * 60 * 60 * 1000;

    // Live mode: upcoming window. Historical mode (explicit from+to): all events in range (schedule only).
    const filtered = historical
      ? events
      : events.filter((e) => {
          const t = new Date(e.scheduledAt).getTime();
          if (!Number.isFinite(t)) return true;
          const delta = t - now.getTime();
          return delta > -30 * 60 * 1000 && delta <= horizonMs;
        });

    // Group by calendar day (YYYY-MM-DD) for backtest UI
    const byDay: Record<string, typeof filtered> = {};
    for (const e of filtered) {
      const day = e.scheduledAt.slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(e);
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        from,
        to,
        hours: historical ? undefined : hours,
        mode: historical ? "historical" : "live",
        count: filtered.length,
        events: filtered,
        byDay,
        contextText: formatNewsContext(filtered, now),
        note: "Schedule only — actual release values are never returned (no look-ahead).",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not configured/i.test(message) ? 500 : 502;
    return new Response(JSON.stringify({ status: "error", message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/economic-calendar")({
  server: {
    handlers: {
      GET: handleGet,
      POST: handlePost, // console page posts JSON; identical semantics to GET(query)
    },
  },
});
