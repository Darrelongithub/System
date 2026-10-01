import { createFileRoute } from "@tanstack/react-router";
import MapGenerator from "@/pages/MapGenerator";

export const Route = createFileRoute("/map-generator")({
  head: () => ({
    meta: [
      { title: "Map Generator — Signal Finder Pro" },
      {
        name: "description",
        content:
          "Generate deterministic synthetic XAUUSD paths with aligned ground-truth regime maps.",
      },
    ],
  }),
  component: MapGenerator,
});
