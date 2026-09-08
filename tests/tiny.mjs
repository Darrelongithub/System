/**
 * Minimal dependency-free test framework: registry + runner.
 * Test files import { test } and register cases; tests/run.mjs drains them.
 */
const registry = [];

export function test(name, fn) {
  registry.push({ name, fn });
}

export function listTests() {
  return registry.map((t) => t.name);
}

export async function runAll(filter) {
  let passed = 0;
  let failed = 0;
  const started = Date.now();
  for (const { name, fn } of registry) {
    if (filter && !name.toLowerCase().includes(String(filter).toLowerCase())) {
      continue;
    }
    const t0 = Date.now();
    try {
      await fn();
      passed++;
      console.log(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${name}`);
      console.error(err && err.stack ? err.stack : String(err));
    }
  }
  console.log(
    `\n${passed + failed === 0 ? "no tests matched" : `${passed} passed, ${failed} failed`} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
  return failed === 0 && passed > 0;
}

export function assert(cond, message) {
  if (!cond) throw new Error(`assertion failed: ${message}`);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `assertion failed: ${message ?? "values differ"}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`,
    );
  }
}

export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `assertion failed: ${message ?? "objects differ"}\n  expected: ${b}\n  actual:   ${a}`,
    );
  }
}
