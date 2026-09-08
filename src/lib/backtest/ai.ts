/**
 * AI-stage helpers for the auto-backtester.
 *
 * v1.5: the Gemini debate stage was removed (the Gemini integration is pruned).
 * The only AI stage left is the V2 verifier/picker, which uses the non-Gemini
 * providers (Lovable / OpenRouter / NVIDIA) via `src/lib/verifier.server.ts`.
 * This module now just formats the verifier's verdict into a day report.
 */

export type AiStage = "off" | "verifier";

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
