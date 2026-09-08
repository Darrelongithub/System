/**
 * Node ESM resolver hooks for the regression suite.
 *
 * The repo ships no test runner and adds no dependency with this suite
 * (bun.lock cannot be regenerated in the sandbox), so tests run on Node's
 * built-in --experimental-strip-types. The hooks below close the two gaps
 * that strip-types cannot handle by itself:
 *   1. TypeScript path alias "@/..." used across src/.
 *   2. Extensionless relative imports ("./daily") used inside src/lib/analyzer.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function asFileUrl(p) {
  return pathToFileURL(p).href;
}

function tryCandidates(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`]) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return asFileUrl(candidate);
      }
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      !err ||
      (err.code !== "ERR_MODULE_NOT_FOUND" &&
        err.code !== "ERR_UNKNOWN_FILE_EXTENSION" &&
        err.code !== "ERR_UNSUPPORTED_DIR_IMPORT")
    ) {
      throw err;
    }
    if (specifier.startsWith("@/")) {
      const hit = tryCandidates(path.join(SRC, specifier.slice(2)));
      if (hit) return { url: hit, shortCircuit: true };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      typeof context.parentURL === "string" &&
      context.parentURL.startsWith("file:")
    ) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      const hit = tryCandidates(base);
      if (hit) return { url: hit, shortCircuit: true };
    }
    throw err;
  }
}
