import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/gemini-console")({
  head: () => ({
    meta: [{ title: "Gemini Console removed — ProSignalsFx" }],
  }),
  component: GeminiConsoleRemoved,
});

function GeminiConsoleRemoved() {
  return (
    <main className="mx-auto max-w-lg p-8 text-sm text-muted-foreground">
      <h1 className="mb-2 text-lg font-semibold text-foreground">Gemini Console removed</h1>
      <p className="mb-4">
        Gemini integration is not part of this production package. Historical research artifacts are
        preserved under artifacts/strategy-research/.
      </p>
      <Link to="/" className="text-primary underline">
        Back to home
      </Link>
    </main>
  );
}
