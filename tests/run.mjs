import { runAll } from "./tiny.mjs";
import { readdirSync } from "node:fs";

const suites = readdirSync(new URL(".", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();
// Load the pinned baseline first; discover all other suites so newly-added risk-,
// adversarial-, watcher-, and future test files cannot silently be skipped.
for (const file of ["golden.test.mjs", ...suites.filter((name) => name !== "golden.test.mjs")]) {
  await import(`./${file}`);
}

const filter = process.argv[2];
const ok = await runAll(filter);
process.exit(ok ? 0 : 1);
