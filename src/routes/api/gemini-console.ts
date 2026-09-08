import { createFileRoute } from "@tanstack/react-router";

/** Gemini Console API removed from production package. */
export const Route = createFileRoute("/api/gemini-console")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { status: "disabled", message: "Gemini Console removed from production." },
          { status: 410 },
        ),
      GET: async () =>
        Response.json(
          { status: "disabled", message: "Gemini Console removed from production." },
          { status: 410 },
        ),
    },
  },
});
