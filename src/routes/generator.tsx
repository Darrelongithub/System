import { createFileRoute } from "@tanstack/react-router";
import DataGenerator from "@/pages/DataGenerator";

export const Route = createFileRoute("/generator")({
  head: () => ({ meta: [{ title: "Data Generator — Signal Finder Pro" }] }),
  component: DataGenerator,
});
