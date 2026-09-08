import { createFileRoute } from "@tanstack/react-router";
import AnalysisV2 from "@/pages/AnalysisV2";

export const Route = createFileRoute("/analysis/")({
  head: () => ({ meta: [{ title: "Live Analyser — Signal Finder Pro" }] }),
  component: AnalysisV2,
});
