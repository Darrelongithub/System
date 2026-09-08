/**
 * Server-side env loading for API routes.
 *
 * Server routes read keys from `process.env` only — keys must never enter the
 * client bundle. Two realities shaped this module:
 *
 * 1. Some runtimes merge `.env` automatically (plain `vite dev`); others do
 *    not (production builds, `vite preview`). The project's `.env` therefore
 *    gets applied here as DEFAULTS for anything not already set.
 * 2. Lovable deploys via nitro's Cloudflare/edge target, where Node's
 *    fs/path/url modules DO NOT EXIST. Static `node:fs` imports at module
 *    scope would crash the whole route module on the edge — so every node
 *    builtin used here is imported dynamically, lazily, and failure-proofed:
 *    in an environment without a filesystem there is no `.env` file to load
 *    anyway (keys come from the platform's injected env), and nothing may
 *    throw.
 *
 * Semantics: existing process.env values always win (never clobbered), file
 * contents are never logged, a missing file is silently tolerated, and the
 * whole call is idempotent.
 */

/** Parse `.env` text into key/value pairs (comments, quotes, blank lines). */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Apply key/value pairs UNLESS the variable is already defined. */
export function applyEnvDefaults(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let loadedOnce = false;

/**
 * Load the project's `.env` into `process.env` (idempotent, non-clobbering).
 * Async + fully guarded: never throws, even on filesystem-less edge runtimes.
 */
export async function ensureServerEnv(): Promise<void> {
  if (loadedOnce) return;
  loadedOnce = true;
  let existsSync: ((p: string) => boolean) | undefined;
  let readFileSync: ((p: string, enc: "utf8") => string) | undefined;
  let join: ((...parts: string[]) => string) | undefined;
  let dirnameFn: ((p: string) => string) | undefined;
  let fileURLToPath: ((p: string) => string) | undefined;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    existsSync = fs.existsSync as typeof existsSync;
    readFileSync = fs.readFileSync as typeof readFileSync;
    join = path.join as typeof join;
    dirnameFn = path.dirname as typeof dirnameFn;
    fileURLToPath = url.fileURLToPath as typeof fileURLToPath;
  } catch {
    // Edge/Workers runtime without node:* builtins: no filesystem means no
    // .env file to load (platform-injected env still applies). Tolerate.
    return;
  }
  if (!existsSync || !readFileSync || !join || !dirnameFn) return;

  const candidates: string[] = [];
  try {
    if (fileURLToPath) {
      // Project root = first ancestor of this file containing package.json.
      let dir = dirnameFn(fileURLToPath(import.meta.url));
      for (let depth = 0; depth < 8; depth++) {
        candidates.push(join(dir, ".env"));
        if (existsSync(join(dir, "package.json"))) break;
        const parent = dirnameFn(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
  } catch {
    /* file URL edge cases — CWD fallback below still applies */
  }
  try {
    candidates.push(join(process.cwd(), ".env"));
  } catch {
    /* cwd unavailable */
  }
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      applyEnvDefaults(parseEnvText(readFileSync(path, "utf8")));
      return; // first existing .env wins; parents/CWD are fallback only
    } catch {
      /* unreadable file → try next candidate */
    }
  }
}
