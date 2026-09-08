/**
 * Gemini Console server helpers — guard hygiene, path-traversal rejection,
 * and artifact-context integration pins.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import {
  aiConsoleStatus,
  consoleContext,
  decisionTimestampsWithCandidates,
  tailAuditRecords,
} from "../src/lib/ai/console.ts";

test("console: audit tail guard rejects traversal/unknown names (fail closed, no throw)", () => {
  for (const bad of [
    "../secrets.jsonl",
    "/etc/passwd",
    "foo.jsonl",
    "gemini-evil.jsonl",
    "gemini-select-.jsonl",
    "GEMINI-SELECT-x.jsonl",
    "",
  ]) {
    assertEqual(tailAuditRecords(bad, 5).length, 0, `rejected: ${bad}`);
  }
});

test("gemini console is removed from production — removal stubs cannot drift", async () => {
  // v1.2 removed the Gemini Console from production. The page renders null,
  // and both the page route and the API route return a 410 removal stub. The
  // prior contract test (console consuming the economic-calendar events/byDay
  // shape) was invalidated by that removal and is replaced by these pins: if
  // the console is ever reinstated, its economic-calendar contract must be
  // re-added deliberately.
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("src/pages/GeminiConsole.tsx", "utf8");
  assert(page.includes("return null"), "page UI removed (renders null)");
  const route = readFileSync("src/routes/gemini-console.tsx", "utf8");
  assert(route.includes("Gemini Console removed"), "page route is a removal stub");
  const api = readFileSync("src/routes/api/gemini-console.ts", "utf8");
  assert(api.includes("410"), "API route returns 410 Gone");
});

test("console: baseline context loads the locked artifacts (2323 trades / 9738 candles)", () => {
  const c = consoleContext();
  assertEqual(c.truth.length, 2323, "golden trades");
  assertEqual(c.candles.length, 9738, "baseline candles");
  assert(c.candles[0].datetime < c.candles[c.candles.length - 1].datetime, "chronological");
  const status = aiConsoleStatus();
  assertEqual(status.baseline.trades, 2323);
  assertEqual(status.promptVersion, "ts-v2-final-1", "final prompt asset detected");
  assertEqual(
    status.geminiConfigured,
    false,
    "no key in the test environment (fail-closed expectation)",
  );
});

test("console: timestamp picker returns only stamps with non-empty candidate sets", () => {
  const stamps = decisionTimestampsWithCandidates(8);
  assertEqual(stamps.length, 8);
  for (const T of stamps) {
    assert(/01:00|11:00|16:00/.test(T), `session open: ${T}`);
  }
  // and they must genuinely have candidates (picker semantics)
  assert(stamps[0] < stamps[7], "chronological");
});
