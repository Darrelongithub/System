import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MT5TradingEngine, OPEN_COMMAND_TTL_MS } from "../src/lib/mt5/engine.ts";
import { verifyAdminRequest } from "../src/lib/mt5/admin-auth.ts";
import { generateMql5EaSource } from "../src/lib/mt5/mql5-ea.ts";

function ready() {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa({
    balance: 10000,
    equity: 10000,
    quoteSymbol: "XAUUSD",
    bid: 2650,
    ask: 2650.2,
    dailyRealizedR: 0,
    consecutiveLosses: 0,
    positions: [],
  });
  return e;
}
const order = (id) => ({
  id,
  symbol: "XAUUSD",
  type: "BUY",
  volume: 0.1,
  strategyId: "s",
  strategyName: "s",
  price: 2650,
  sl: 2640,
  tp: 2670,
});
test("OPEN rejection removes only its optimistic slot; confirmations are not fabricated fills", () => {
  const e = ready();
  assert.equal(e.placeOrder(order("cmd1")).ok, true);
  assert.equal(e.getPositions().length, 1);
  assert.equal(
    e.getLogs().some((x) => x.type === "ORDER_FILLED"),
    false,
  );
  e.reconcileOutcomes([{ id: "cmd1", status: "REJECTED", error: "spread", retcode: 1 }]);
  assert.equal(e.getPositions().length, 0);
  assert.equal(e.getPendingCommands().length, 0);
  assert.ok(e.getLogs().some((x) => x.type === "ORDER_REJECTED" && x.message.includes("spread")));
  e.reconcileOutcomes([{ id: "cmd1", status: "REJECTED" }]);
  assert.equal(e.getLogs().filter((x) => x.type === "ORDER_REJECTED").length, 1);
});
test("OPEN fill acknowledged once; live positions come from telemetry", () => {
  const e = ready();
  e.placeOrder(order("cmd2"));
  e.acknowledgeCommands(["cmd2"]);
  assert.equal(
    e.getPendingCommands().length,
    1,
    "legacy id-only acknowledgment cannot erase an OPEN",
  );
  e.reconcileOutcomes([
    { id: "cmd2", status: "FILLED", ticket: 771, price: 2650.2, retcode: 10009 },
  ]);
  assert.equal(e.getPositions().length, 0);
  assert.ok(e.getLogs().some((x) => x.type === "ORDER_FILLED" && x.message.includes("771")));
  e.syncFromEa({
    balance: 10000,
    equity: 10000,
    positions: [
      {
        ticket: 771,
        symbol: "XAUUSD",
        type: "BUY",
        volume: 0.1,
        openPrice: 2650.2,
        currentPrice: 2650,
        sl: 2640,
        tp: 2670,
        profit: -2,
        comment: "test",
        magic: 992200,
      },
    ],
  });
  assert.equal(e.getPositions()[0].ticket, 771);
});
test("OPEN expires on the TTL boundary and is not dispatchable after restart", () => {
  const e = ready();
  e.placeOrder(order("cmd3"));
  const snap = e.exportRuntimeState();
  e.expireOpenCommands(snap.pendingCommands[0].createdAtMs + OPEN_COMMAND_TTL_MS);
  assert.equal(e.getPendingCommands().length, 0);
  assert.equal(e.getPositions().length, 0);
  snap.pendingCommands[0].createdAtMs = Date.now() - OPEN_COMMAND_TTL_MS;
  const restored = new MT5TradingEngine();
  restored.restoreRuntimeState(snap);
  assert.equal(restored.getPendingCommands().length, 0);
});
test("admin authentication accepts either header and fails closed when configured", () => {
  assert.equal(verifyAdminRequest(new Request("https://example.test"), ""), true);
  assert.equal(verifyAdminRequest(new Request("https://example.test"), "secret"), false);
  assert.equal(
    verifyAdminRequest(
      new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }),
      "secret",
    ),
    false,
  );
  assert.equal(
    verifyAdminRequest(
      new Request("https://example.test", { headers: { authorization: "Bearer secret" } }),
      "secret",
    ),
    true,
  );
  assert.equal(
    verifyAdminRequest(
      new Request("https://example.test", { headers: { "x-mt5-admin-token": "secret" } }),
      "secret",
    ),
    true,
  );
});
test("runtime state survives a fresh server process with restricted file permissions", () => {
  const dir = mkdtempSync(join(tmpdir(), "mt5-state-"));
  const file = join(dir, "state.json");
  const env = { ...process.env, MT5_RUNTIME_STATE_PATH: file, MT5_ADMIN_TOKEN: "test" };
  delete env.MT5_STATE_DISABLED;
  delete env.NODE_ENV;
  const run = (code) =>
    execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        "./tests/register.mjs",
        "--input-type=module",
        "-e",
        code,
      ],
      { cwd: process.cwd(), env, encoding: "utf8" },
    );
  try {
    run(
      `import {initializeRuntimeState} from './src/lib/mt5/runtime-state.ts'; import {mt5Engine as e} from './src/lib/mt5/engine.ts'; initializeRuntimeState(); e.setCredentials({bridgeMode:'mql5_ea', apiToken:'bridge-test'}); e.setConfig({enabled:true,newsFilterEnabled:false,rolloverEnabled:false,fridayCloseEnabled:false}); e.syncFromEa({balance:10000,equity:10000,quoteSymbol:'XAUUSD',bid:2650,ask:2650.2,dailyRealizedR:0,consecutiveLosses:0,positions:[]}); e.placeOrder({id:'persist1',symbol:'XAUUSD',type:'BUY',volume:0.1,strategyId:'s',strategyName:'s'}); e.syncFromEa({balance:10000,equity:9799,quoteSymbol:'XAUUSD',bid:2650,ask:2650.2,dailyRealizedR:0,consecutiveLosses:0,positions:[]});`,
    );
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const state = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(state.risk.dailyLocked, true);
    assert.equal(state.identity.apiToken, "bridge-test");
    assert.equal(state.pendingCommands[0].id, "persist1");
    const out = run(
      `import {initializeRuntimeState} from './src/lib/mt5/runtime-state.ts'; import {mt5Engine as e} from './src/lib/mt5/engine.ts'; initializeRuntimeState(); console.log(JSON.stringify(e.exportRuntimeState()));`,
    );
    const restored = JSON.parse(out.trim().split("\n").at(-1));
    assert.equal(restored.risk.dailyLocked, true);
    assert.equal(restored.identity.apiToken, "bridge-test");
    assert.equal(restored.pendingCommands[0].id, "persist1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Strip comments and literal contents before checking delimiter balance. This is
// only a lexical check, NOT a replacement for MetaEditor compilation.
function stripMql(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) =>
    " ".repeat(m.length),
  );
}
test("generated EA lexical sanity, event signatures and calendar call arity", () => {
  const src = generateMql5EaSource({
    serverUrl: "https://example.test/bridge",
    authToken: "safe-token",
  });
  assert.doesNotMatch(src, /\$\{[^}]*\}/);
  const clean = stripMql(src);
  const stack = [];
  for (const c of clean) {
    if (c === "{" || c === "(") stack.push(c);
    else if (c === "}" || c === ")") assert.equal(stack.pop(), c === "}" ? "{" : "(");
  }
  assert.equal(stack.length, 0);
  assert.match(clean, /\bint\s+OnInit\s*\(\s*\)/);
  assert.match(clean, /\bvoid\s+OnDeinit\s*\(\s*const\s+int\s+\w+\s*\)/);
  assert.match(clean, /\bvoid\s+OnTimer\s*\(\s*\)/);
  assert.match(clean, /\bMqlCalendarValue\s+\w+\s*\[\s*\]/);
  const calls = [...clean.matchAll(/\bCalendarValueHistory\s*\(([^()]*)\)/g)];
  assert.ok(calls.length >= 2);
  for (const call of calls) assert.equal(call[1].split(",").length, 5);
});

test("persisted signal key prevents a duplicate after a fresh engine restore", () => {
  const first = ready();
  first.setConfig({ strategies: [] });
  const signal = {
    result: "PASS",
    strategyId: "unique",
    strategy: "unique",
    side: "long",
    datetime: "2026-12-01T08:00:00Z",
    entry: 2650,
    sl: 2640,
    tp: 2675,
    rr: 2.5,
  };
  assert.equal(first.handleLiveStrategySignal(signal, "XAU/USD").ok, true);
  const saved = first.exportRuntimeState();
  assert.equal(saved.executedSignals.length, 1);
  const restored = new MT5TradingEngine();
  restored.restoreRuntimeState(saved);
  restored.syncFromEa({
    balance: 10000,
    equity: 10000,
    quoteSymbol: "XAUUSD",
    bid: 2650,
    ask: 2650.2,
    dailyRealizedR: 0,
    consecutiveLosses: 0,
    positions: [],
  });
  assert.equal(restored.handleLiveStrategySignal(signal, "XAU/USD"), null);
  assert.equal(restored.getPendingCommands().length, 1);
});

test("persistence failure disables entries instead of dispatching unrecorded commands", () => {
  const e = ready();
  const previous = console.error;
  console.error = () => {};
  try {
    e.setPersistence(() => {
      throw new Error("disk full");
    });
    const result = e.placeOrder(order("diskfail"));
    assert.equal(result.ok, false);
    assert.equal(e.getConfig().enabled, false);
    assert.equal(
      e.getDispatchableCommands().some((x) => x.action === "OPEN"),
      false,
    );
  } finally {
    console.error = previous;
  }
});
