/**
 * AI stages for the auto-backtester.
 *
 * - "verifier" runs the V2 verifier/picker server function on the day report.
 * - "debate" streams the full Gemini <-> GPT debate through /api/analysis
 *   (charts are omitted: the backtester is CSV-only).
 */

export type AiStage = "off" | "verifier" | "debate" | "both";

export interface DebateOutcome {
  status: string;
  agreed: boolean;
  summary: string;
  transcript: string;
}

/** Newline-delimited JSON events from /api/analysis. */
export async function runDebate(input: {
  symbol: string;
  range: string;
  ohlcCsv: string;
  summaryFields: string;
  onLog?: (message: string) => void;
}): Promise<DebateOutcome> {
  const response = await fetch("/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: input.symbol,
      range: input.range,
      ohlcCsv: input.ohlcCsv,
      charts: [],
      summaryFields: input.summaryFields,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`debate request failed [${response.status}]: ${text.slice(0, 400)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const transcript: string[] = [];
  let current: { model: string; text: string } | null = null;
  let summary = "";
  let status = "UNKNOWN";
  let agreed = false;
  let failure: string | null = null;

  const flush = () => {
    if (current && current.text.trim() !== "") {
      transcript.push(`--- ${current.model.toUpperCase()} ---\n${current.text.trim()}\n`);
    }
    current = null;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim() === "") continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = String(event["type"] ?? "");
      if (type === "turn-start") {
        flush();
        current = { model: String(event["model"] ?? "model"), text: "" };
      } else if (type === "delta") {
        const model = String(event["model"] ?? "");
        const text = String(event["text"] ?? "");
        if (model === "summary") summary += text;
        else if (current) current.text += text;
      } else if (type === "turn-end") {
        flush();
      } else if (type === "summary") {
        summary = String(event["text"] ?? summary);
        status = String(event["status"] ?? status);
      } else if (type === "final-status") {
        status = String(event["status"] ?? status);
      } else if (type === "done") {
        agreed = Boolean(event["agreed"]);
        status = String(event["status"] ?? status);
      } else if (type === "log" || type === "status") {
        const message = String(event["message"] ?? "");
        if (message) input.onLog?.(`debate: ${message}`);
      } else if (type === "error") {
        failure = String(event["message"] ?? "debate failed");
      }
    }
  }
  flush();

  if (failure) throw new Error(failure);

  return { status, agreed, summary: summary.trim(), transcript: transcript.join("\n") };
}

/** Appends the AI sections to a day report so the ZIP stays self-contained. */
export function appendAiSections(
  report: string,
  sections: { title: string; body: string }[],
): string {
  if (sections.length === 0) return report;
  const blocks = sections.map(
    (section) => `\n=== ${section.title} ===\n${section.body.trim() || "(empty response)"}`,
  );
  return `${report}\n${blocks.join("\n")}\n`;
}
