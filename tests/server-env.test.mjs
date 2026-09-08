/* Regression pins for the OHLC self-fetch fixes (server env loading + provider-error surfaces). */
import { test, assert, assertEqual } from "./tiny.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const mod = await import("../src/lib/server-env.ts");
const { parseEnvText, applyEnvDefaults, ensureServerEnv } = mod;

test("server-env: parser handles comments/quotes/blanks and rejects junk keys", () => {
  const parsed = parseEnvText(
    [
      "# comment",
      "TWELVE_DATA_API_KEY=abc123",
      'OPENROUTER_API_KEY="quoted value"',
      "SPACED = around-eq ",
      "1BAD=value",
      "",
      "NOEQUALS",
    ].join("\n"),
  );
  assertEqual(parsed["TWELVE_DATA_API_KEY"], "abc123");
  assertEqual(parsed["OPENROUTER_API_KEY"], "quoted value");
  assertEqual(parsed["SPACED"], "around-eq");
  assert(!("1BAD" in parsed) && !("NOEQUALS" in parsed), "junk lines ignored");
});

test("server-env: applyEnvDefaults never clobbers existing process.env", () => {
  const key = "SERVER_ENV_TEST_SENTINEL";
  process.env[key] = "existing";
  applyEnvDefaults({ [key]: "from-file", SERVER_ENV_TEST_NEW: "new" });
  assertEqual(process.env[key], "existing", "existing env wins");
  assertEqual(process.env["SERVER_ENV_TEST_NEW"], "new", "missing key filled from file");
  delete process.env[key];
  delete process.env["SERVER_ENV_TEST_NEW"];
});

test("server-env: ensureServerEnv loads a project .env once, non-clobbering, from any CWD", async () => {
  // A dedicated subprocess so the module's one-shot guard starts fresh.
  const dir = mkdtempSync(join(tmpdir(), "server-env-"));
  writeFileSync(join(dir, "package.json"), "{}");
  writeFileSync(join(dir, ".env"), "ENSURE_LOADED_MARK=77\nENSURE_PRESET_MARK=file-value\n");
  // The probe imports a module COPIED under the temp root, so resolveServerEnv
  // walks up to dir/.env (closest package.json) — mirroring a real project.
  const src = await import("node:fs/promises");
  await src.mkdir(join(dir, "lib"), { recursive: true });
  await src.copyFile(
    new URL("../src/lib/server-env.ts", import.meta.url).pathname,
    join(dir, "lib", "server-env.ts"),
  );
  writeFileSync(
    join(dir, "probe.mjs"),
    [
      `import { ensureServerEnv } from ${JSON.stringify(pathToFileURL(join(dir, "lib", "server-env.ts")).href)};`,
      "await ensureServerEnv();",
      "console.log('L=' + process.env.ENSURE_LOADED_MARK + '|P=' + process.env.ENSURE_PRESET_MARK);",
    ].join("\n"),
  );
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      new URL("./register.mjs", import.meta.url).pathname,
      "probe.mjs",
    ],
    { cwd: dir, env: { ...process.env, ENSURE_PRESET_MARK: "env-value" }, encoding: "utf8" },
  );
  assert(out.includes("L=77"), "file value loaded when absent");
  assert(out.includes("P=env-value"), "pre-set env not clobbered by file");
  rmSync(dir, { recursive: true, force: true });
});

test("market-data route: Twelve Data keys only — collector layouts + Finnhub never a candle provider", async () => {
  const routeSrc = (await import("node:fs")).readFileSync("src/routes/api/market-data.ts", "utf8");
  // hard source pin: Finnhub is news-only, candles come from Twelve Data
  assert(
    !routeSrc.includes("fetchFromFinnhub(") && !routeSrc.includes("finnhub.io"),
    "no Finnhub candle path remains",
  );
  const { collectTwelveDataKeys } = await import("../src/routes/api/market-data.ts");
  assertEqual(
    collectTwelveDataKeys({ TWELVE_DATA_API_KEYS: "k1, k2 ,k3" }).join(","),
    "k1,k2,k3",
    "CSV layout",
  );
  assertEqual(
    collectTwelveDataKeys({ TWELVE_DATA_API_KEY: "solo" }).join(","),
    "solo",
    "single layout",
  );
  assertEqual(
    collectTwelveDataKeys({
      TWELVE_DATA_API_KEY_1: "a",
      TWELVE_DATA_API_KEY_2: "b",
      TWELVE_DATA_API_KEY_4: "c",
    }).join(","),
    "a,b,c",
    "suffixed singles layout",
  );
  assertEqual(
    collectTwelveDataKeys({
      TWELVE_DATA_API_KEYS: "x,y",
      TWELVE_DATA_API_KEY: "z",
      TWELVE_DATA_API_KEY_1: "y",
    }).join(","),
    "x,y,z",
    "all layouts merge, dedupe, stable order",
  );
  assertEqual(collectTwelveDataKeys({}).length, 0, "no keys → empty");
});

test("edge-safe: no static node:* imports may re-enter the env loader or its route callers", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of [
    "src/lib/server-env.ts",
    "src/routes/api/market-data.ts",
    "src/lib/verifier.server.ts",
  ]) {
    const src = readFileSync(f, "utf8");
    const staticNode = /\nimport\s+[^"']*["']node:(fs|path|url)["']/.exec("\n" + src);
    assert(
      !staticNode,
      `${f}: static node:* import would crash the route module on edge (nitro/cloudflare) runtimes`,
    );
  }
});

test("server-env: no key material in loader surfaces", () => {
  assert(!JSON.stringify(Object.keys(mod)).toLowerCase().includes("key"), "only helpers exported");
});
