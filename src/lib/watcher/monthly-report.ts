import { readTradeJournal } from "./trade-journal";
import type { TradeJournalEntry, GeminiReview } from "./types";

const money = (n: number) => n.toFixed(2);
function eatHour(iso: string): string {
  const date = new Date(Date.parse(iso) + 3 * 60 * 60_000);
  return `${String(date.getUTCHours()).padStart(2, "0")}:00 EAT`;
}

export async function buildMonthlyMaintenanceReport(month: string): Promise<string> {
  const lines = await readTradeJournal(month);
  const entries = lines.flatMap((line) =>
    line.kind === "trade" && line.entry ? [line.entry] : [],
  );
  const reviews = new Map<string, GeminiReview>();
  for (const line of lines)
    if (line.kind === "review" && line.review) reviews.set(line.eventId, line.review);
  const strategies = new Map<string, TradeJournalEntry[]>();
  const hours = new Map<string, { slippage: number; spread: number; count: number }>();
  const tags = new Map<string, number>();
  const shadows: { text: string; tag: string }[] = [];
  for (const entry of entries) {
    const bucket = strategies.get(entry.strategyId) ?? [];
    bucket.push(entry);
    strategies.set(entry.strategyId, bucket);
    const hour = eatHour(entry.timestamp);
    const h = hours.get(hour) ?? { slippage: 0, spread: 0, count: 0 };
    if (entry.signalVsFillSlippage !== null) h.slippage += Math.abs(entry.signalVsFillSlippage);
    if (entry.spread !== null) h.spread += entry.spread;
    h.count++;
    hours.set(hour, h);
    const review = reviews.get(entry.eventId);
    if (review) {
      tags.set(review.forensicTag, (tags.get(review.forensicTag) ?? 0) + 1);
      if (review.shadowCounterfactual)
        shadows.push({ text: review.shadowCounterfactual, tag: review.forensicTag });
    }
  }
  const report = [
    `# Monthly Maintenance Dossier — ${month}`,
    "",
    `Trades journaled: **${entries.length}**`,
    `AI reviews: **${reviews.size}**`,
    "",
    "## Per-bot live health vs baseline",
    "| Strategy | Trades | Resolved R | Avg R | Avg abs slippage | Baseline |",
    "|---|---:|---:|---:|---:|---|",
  ];
  for (const [id, trades] of [...strategies].sort(([a], [b]) => a.localeCompare(b))) {
    const realized = trades.flatMap((trade) => (trade.realizedR === null ? [] : [trade.realizedR]));
    const slip = trades.flatMap((trade) =>
      trade.signalVsFillSlippage === null ? [] : [Math.abs(trade.signalVsFillSlippage)],
    );
    report.push(
      `| ${id} | ${trades.length} | ${money(realized.reduce((a, b) => a + b, 0))}R | ${realized.length ? money(realized.reduce((a, b) => a + b, 0) / realized.length) : "n/a"}R | ${slip.length ? money(slip.reduce((a, b) => a + b, 0) / slip.length) : "n/a"} | Not supplied |`,
    );
  }
  if (!strategies.size) report.push("| — | 0 | n/a | n/a | n/a | Not supplied |");
  report.push(
    "",
    "## Spread/slippage leak by EAT hour",
    "| EAT hour | Trades | Avg abs slippage | Avg spread |",
    "|---|---:|---:|---:|",
  );
  for (const [hour, stats] of [...hours].sort(([a], [b]) => a.localeCompare(b)))
    report.push(
      `| ${hour} | ${stats.count} | ${money(stats.slippage / stats.count)} | ${money(stats.spread / stats.count)} |`,
    );
  report.push("", "## Forensic tag breakdown", "| Tag | Count |", "|---|---:|");
  for (const [tag, count] of [...tags].sort(([a], [b]) => a.localeCompare(b)))
    report.push(`| ${tag} | ${count} |`);
  report.push(
    "",
    "## Scored shadow suggestions",
    "| Suggestion | Tag | Month-end grade |",
    "|---|---|---|",
  );
  for (const suggestion of shadows)
    report.push(
      `| ${suggestion.text.replaceAll("|", "\\|")} | ${suggestion.tag} | Not graded: requires out-of-sample replay |`,
    );
  if (!shadows.length)
    report.push("| No AI shadow suggestions | — | No Gemini reviews available |");
  report.push(
    "",
    "## Top testable hypotheses",
    ...shadows
      .slice(0, 5)
      .map(
        (s, i) =>
          `${i + 1}. ${s.text} *(tag: ${s.tag}; validate with a pre-registered out-of-sample replay)*`,
      ),
  );
  report.push(
    "",
    "> Read-only report. Shadow suggestions are hypotheses only; no configuration or live execution was changed.",
  );
  return report.join("\n");
}
