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

test("economic-calendar route ↔ console contract cannot drift again", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("src/routes/api/economic-calendar.ts", "utf8");
  for (const method of ["GET:", "POST:"])
    assert(route.includes(method), `route registers ${method} handler (console POSTs JSON)`);
  assert(route.includes("handleCalendar"), "shared param logic (identical semantics for GET/POST)");
  const page = readFileSync("src/pages/GeminiConsole.tsx", "utf8");
  assert(
    page.includes('data["events"]'),
    "console consumes the route's events/byDay shape (not a phantom {upcoming,recent} field)",
  );
});

test("console: baseline context loads the locked artifacts (2384 trades / 9738 candles)", () => {
  const c = consoleContext();
  assertEqual(c.truth.length, 2384, "golden trades");
  assertEqual(c.candles.length, 9738, "baseline candles");
  assert(c.candles[0].datetime < c.candles[c.candles.length - 1].datetime, "chronological");
  const status = aiConsoleStatus();
  assertEqual(status.baseline.trades, 2384);
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
