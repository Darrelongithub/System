import { createFileRoute } from "@tanstack/react-router";
import { ensureServerEnv } from "@/lib/server-env";
import { getFredMacroSnapshot } from "@/lib/watcher/fred-macro";

export const Route = createFileRoute("/api/watcher/fred")({
  server: {
    handlers: {
      GET: async () => {
        await ensureServerEnv();
        return Response.json(await getFredMacroSnapshot());
      },
    },
  },
});
