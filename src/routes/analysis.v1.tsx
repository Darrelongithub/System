import { createFileRoute } from "@tanstack/react-router";
import Analysis from "@/pages/Analysis";

/**
 * DEPRECATED: V1 AI debate is not the canonical signal path.
 * It must not feed trade statistics. Prefer /analysis/v2 (runAnalysis).
 */
export const Route = createFileRoute("/analysis/v1")({
  head: () => ({
    meta: [
      { title: "[DEPRECATED] Analyser V1 — AI Debate — ProSignalsFx" },
      {
        name: "description",
        content:
          "Deprecated. AI debate is commentary only and does not use the canonical analyzer. Use Live Analysis (V2).",
      },
      { property: "og:title", content: "[DEPRECATED] Analyser V1" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Analysis,
});
