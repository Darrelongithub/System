import { createFileRoute } from "@tanstack/react-router";
import AnalysisV2 from "@/pages/AnalysisV2";

export const Route = createFileRoute("/analysis/v2")({
  head: () => ({
    meta: [
      { title: "Live Analysis — ProSignalsFx" },
      {
        name: "description",
        content:
          "Canonical live analysis: same runAnalysis engine as the backtester. Trade setups and context observations separated.",
      },
      { property: "og:title", content: "Live Analysis — ProSignalsFx" },
      {
        property: "og:description",
        content:
          "Every candle checked against 13 structure strategies, with RR math, setup status and a verifier stage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalysisV2,
});
