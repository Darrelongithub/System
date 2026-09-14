/**
 * F6 regression — the shared cooldown() countdown (ohlc-generator.ts) is the
 * only thing standing between a rate-limited provider response and a 60s UI
 * lock. It must tick the visible countdown once per second, clear it when it
 * finishes, and reject IMMEDIATELY when the caller's Stop signal aborts —
 * including a signal that was already aborted before the wait started. A
 * countdown that ignored the signal would make the Stop button lie.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { cooldown } from "../src/lib/ohlc-generator.ts";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("F6: cooldown ticks down once per second and clears on completion", async () => {
  const ticks = [];
  await cooldown(2, (value) => ticks.push(value));
  assertDeep(ticks, [2, 1, null], `expected [2,1,null], got ${JSON.stringify(ticks)}`);
});

test("F6: an already-aborted signal rejects immediately and clears the countdown", async () => {
  const controller = new AbortController();
  controller.abort();
  const ticks = [];

  const start = Date.now();
  let threw = false;
  try {
    await cooldown(60, (value) => ticks.push(value), controller.signal);
  } catch {
    threw = true;
  }
  assert(threw, "pre-aborted cooldown must reject");
  assert(Date.now() - start < 1000, "must not wait any seconds on a pre-aborted signal");
  assertDeep(ticks, [null], `countdown must be cleared, got ${JSON.stringify(ticks)}`);
});

test("F6: aborting mid-wait rejects at once instead of waiting out the countdown", async () => {
  const controller = new AbortController();
  const ticks = [];

  const pending = cooldown(60, (value) => ticks.push(value), controller.signal);
  await delay(250);
  controller.abort();

  const start = Date.now();
  let threw = false;
  try {
    await pending;
  } catch {
    threw = true;
  }
  assert(threw, "aborted cooldown must reject");
  assert(
    Date.now() - start < 1000,
    "rejection must follow the abort immediately, not after the next tick",
  );
  assertEqual(ticks[ticks.length - 1], null, "countdown cleared on the way out");
  assert(ticks[0] === 60, `first tick should be 60, got ${String(ticks[0])}`);
});

function assertDeep(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`assertion failed: ${message}`);
}
