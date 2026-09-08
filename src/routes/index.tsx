import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal Finder Pro" },
      {
        name: "description",
        content:
          "Trading data generation, backtesting and live strategy analysis.",
      },
      { property: "og:title", content: "Signal Finder Pro" },
      {
        property: "og:description",
        content:
          "Trading data generation, backtesting and live strategy analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
