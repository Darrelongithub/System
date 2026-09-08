// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // IMPORTANT: Do NOT use 0.0.0.0 / :: (wildcard).
      // Lovable / some sandbox environments force wildcard host, which breaks
      // local startup (Vite resolveServerUrls fails with ERR_SYSTEM_ERROR 13,
      // or the machine refuses the bind).
      // Explicit loopback keeps the app reachable at http://127.0.0.1:5173
      // and http://localhost:5173 without that path.
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
      // Keep HMR on the same host so the browser can connect.
      hmr: {
        host: "127.0.0.1",
        port: 5173,
      },
    },
  },
});
