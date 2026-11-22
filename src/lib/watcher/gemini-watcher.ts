import type { GeminiReview, TradeJournalEntry } from "./types";
import { appendGeminiReview } from "./trade-journal";

export type GeminiStatus = "disabled_no_key" | "ok" | "error";
const GRADES = new Set(["A", "B", "C", "D", "F"]);
const TAGS = new Set([
  "CLEAN_TREND_TP",
  "CLEAN_REVERSAL_SL",
  "LATE_EXHAUSTION",
  "NEWS_WHIPSAW",
  "SPREAD_SLIPPAGE_LEAK",
  "CHOP_FAKEOUT",
]);
const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, max) : "";

function parseReview(raw: string): Omit<GeminiReview, "reviewedAt"> {
  const json = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const value = JSON.parse(json) as Record<string, unknown>;
  if (!GRADES.has(String(value["executionGrade"])) || !TAGS.has(String(value["forensicTag"])))
    throw new Error("Gemini returned invalid grade/tag enum");
  return {
    setupSummary: clip(value["setupSummary"], 1200),
    executionGrade: value["executionGrade"] as GeminiReview["executionGrade"],
    forensicTag: value["forensicTag"] as GeminiReview["forensicTag"],
    shadowCounterfactual: clip(value["shadowCounterfactual"], 1200),
  };
}

/** Read-only post-trade review. It has no order/execution interfaces by design. */
export async function reviewTrade(
  entry: TradeJournalEntry,
  options: { apiKey?: string; model?: string; fetcher?: typeof fetch } = {},
): Promise<{ aiStatus: GeminiStatus; review?: GeminiReview; error?: string }> {
  const apiKey = options.apiKey ?? process.env["GEMINI_API_KEY"];
  if (!apiKey) return { aiStatus: "disabled_no_key" };
  try {
    const model = options.model ?? process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a read-only trade forensics reviewer. Do not suggest executing, blocking, modifying, or switching any trade. Return only JSON with setupSummary, executionGrade (A/B/C/D/F), forensicTag (CLEAN_TREND_TP/CLEAN_REVERSAL_SL/LATE_EXHAUSTION/NEWS_WHIPSAW/SPREAD_SLIPPAGE_LEAK/CHOP_FAKEOUT), shadowCounterfactual (a testable hypothetical only). Distinguish strategy outcome from spread/slippage. Data: ${JSON.stringify({ strategyId: entry.strategyId, side: entry.side, entry: entry.entry, exit: entry.exit, sl: entry.sl, tp: entry.tp, slippage: entry.signalVsFillSlippage, spread: entry.spread, realizedR: entry.realizedR, regime: entry.regime, volatility: entry.volatility, upcomingNews: entry.upcomingNews, macro: entry.macro.series })}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text) throw new Error("Gemini returned no review text");
    const review: GeminiReview = { ...parseReview(text), reviewedAt: new Date().toISOString() };
    await appendGeminiReview(entry.eventId, review, entry.timestamp);
    return { aiStatus: "ok", review };
  } catch (error) {
    return {
      aiStatus: "error",
      error: error instanceof Error ? error.message.slice(0, 240) : "Gemini review failed",
    };
  }
}
