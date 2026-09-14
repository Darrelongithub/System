// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Set VITE_DEV_HOST=0.0.0.0 when running behind a remote/container preview
// proxy (e.g. Arena/e2b). Local development needs no env var and keeps the
// loopback defaults below.
const previewHost = process.env["VITE_DEV_HOST"];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // IMPORTANT: Do NOT use 0.0.0.0 / :: (wildcard) on a plain local
      // machine — Lovable / some sandbox environments force wildcard host,
      // which breaks local startup (Vite resolveServerUrls fails with
      // ERR_SYSTEM_ERROR 13, or the machine refuses the bind).
      // Explicit loopback keeps the app reachable at http://127.0.0.1:5173
      // and http://localhost:5173 without that path. A container/preview
      // proxy instead requires a wildcard bind (set VITE_DEV_HOST=0.0.0.0).
      host: previewHost ?? "127.0.0.1",
      port: 5173,
      strictPort: false,
      // Dev server only: accept the hostname of reverse-proxy previews.
      allowedHosts: true,
      // Keep HMR on loopback for local dev so the browser can connect.
      // Behind a preview proxy leave HMR unset so it follows the page origin.
      ...(previewHost
        ? {}
        : {
            hmr: {
              host: "127.0.0.1",
              port: 5173,
            },
          }),
    },
  },
});
